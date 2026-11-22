/* Web học tập - code dùng chung cho mọi môn.
   Dữ liệu: du-lieu/danh-sach-mon.json và du-lieu/<ma-mon>.json (xem README.md).
   Không cần sửa file này khi thêm câu hỏi, thêm môn hay thêm tài liệu. */
(function () {
  "use strict";

  var DS_MON = "du-lieu/danh-sach-mon.json";
  var KEYS = ["A", "B", "C", "D"];
  var WIRES = ["var(--w-or)", "var(--w-gr)", "var(--w-bl)", "var(--w-br)"];
  var PREFIX = "hoc-tap:v1:";
  var HISTORY_MAX = 300;
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var MARK_OK = '<svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var MARK_BAD = '<svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
  var HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 6.9 4.5c2.1 0 3.6 1.2 5.1 3 1.5-1.8 3-3 5.1-3 3.5 0 5.5 3.5 4.2 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>';
  var PDF_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h4"/></svg>';
  var main = document.getElementById("noi-dung");

  var registry = null;
  var subjects = {};
  var quiz = { view: "mon" };
  var lastView = "";

  /* ---------- Tiện ích ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function store(k, v) { try { if (v === null) localStorage.removeItem(PREFIX + k); else localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) {} }
  function load(k) { try { var s = localStorage.getItem(PREFIX + k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function wire(i) { return WIRES[i % 4]; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function clock(sec) { sec = Math.max(0, Math.ceil(sec)); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ":" + pad2(m) : m) + ":" + pad2(s); }
  function duration(sec) { sec = Math.round(sec || 0); if (sec < 60) return sec + " giây"; var m = Math.round(sec / 60); return m < 60 ? m + " phút" : Math.floor(m / 60) + " giờ" + (m % 60 ? " " + m % 60 + " phút" : ""); }

  /* Tổ hợp viết theo kiểu Việt Nam: \binom{n}{k} (cả \dbinom, \tbinom) hiện thành C_n^k. */
  function readArg(t, p) {
    while (t[p] === " ") p++;
    if (t[p] === "{") {
      for (var k = p, depth = 0; k < t.length; k++) {
        if (t[k] === "\\") { k++; continue; }
        if (t[k] === "{") depth++;
        else if (t[k] === "}" && --depth === 0) return { v: t.slice(p + 1, k), e: k + 1 };
      }
      return null;
    }
    if (t[p] === "\\") { var m = /^\\[a-zA-Z]+/.exec(t.slice(p)); return m ? { v: m[0], e: p + m[0].length } : { v: t.substr(p, 2), e: p + 2 }; }
    return p < t.length ? { v: t[p], e: p + 1 } : null;
  }
  function vnBinom(t) {
    if (t.indexOf("binom") < 0) return t;
    var re = /\\[dt]?binom(?![a-zA-Z])/g, out = "", last = 0, m;
    while ((m = re.exec(t))) {
      var a = readArg(t, re.lastIndex), b = a && readArg(t, a.e);
      if (!b) continue;
      out += t.slice(last, m.index) + "{C_{" + a.v + "}^{" + b.v + "}}";
      last = b.e; re.lastIndex = b.e;
    }
    return out + t.slice(last);
  }
  /* Văn bản có công thức: $...$ (trong dòng) và $$...$$ (riêng một dòng) được vẽ bằng KaTeX.
     \$ là dấu đô la thật. Phần chữ vẫn được escape như cũ; nếu KaTeX không tải được thì hiện nguyên mã công thức. */
  function rich(s) {
    s = String(s == null ? "" : s);
    if (s.indexOf("$") < 0) return esc(s);
    var out = "", last = 0, m, MARK = "";
    s = s.replace(/\\\$/g, MARK);                       /* \$ = dấu đô la thật, không mở công thức */
    var re = /\$\$([\s\S]+?)\$\$|\$((?:\\.|[^$\\])+?)\$/g;
    function plain(x) { return esc(x.split(MARK).join("$")); }
    while ((m = re.exec(s))) {
      out += plain(s.slice(last, m.index));
      var disp = m[1] !== undefined, tex = vnBinom((disp ? m[1] : m[2]).split(MARK).join("\\$").trim());
      try {
        if (!window.katex) throw new Error("katex");
        var html = window.katex.renderToString(disp ? tex : tex.replace(/\\frac(?![a-zA-Z])/g, "\\dfrac"), { displayMode: disp, throwOnError: false, strict: "ignore" });
        /* dấu câu liền sau công thức dính vào công thức (word joiner), không bị rớt xuống đầu dòng riêng */
        var pm = disp ? null : /^[.,;:!?)\]]+/.exec(s.slice(re.lastIndex));
        if (pm) { html += "⁠" + esc(pm[0]); re.lastIndex += pm[0].length; }
        out += html;
      } catch (e) { out += '<code class="tex-raw">' + esc(m[0].split(MARK).join("\\$")) + "</code>"; }
      last = re.lastIndex;
    }
    return out + plain(s.slice(last));
  }
  /* Câu hỏi có code: phần chữ (đoạn đầu) giữ nguyên, phần còn lại sau dòng xuống đầu tiên là code, hiện trong khung chữ đều, giữ thụt lề. */
  function qrich(s) {
    s = String(s == null ? "" : s);
    var i = s.indexOf("\n");
    if (i < 0) return rich(s);
    var code = s.slice(i + 1).replace(/^\s*\n/, "").replace(/\s+$/, "");
    return rich(s.slice(0, i)) + '<pre class="code"><code>' + esc(code) + "</code></pre>";
  }
  /* Vẽ một màn hình. Chỉ chạy hiệu ứng vào trang khi đổi sang màn hình khác. Rời màn làm bài thì dừng đồng hồ. */
  function render(html, viewName) {
    var v = viewName || "";
    if (v !== "quiz") pauseClock();
    var anim = v !== lastView;
    lastView = v;
    document.body.classList.toggle("focus", v === "quiz");   /* điện thoại: đang làm bài thì thu thanh điều hướng vào cạnh trái */
    closeDrawer();
    main.innerHTML = '<div class="page' + (anim ? " enter" : "") + '">' + html + "</div>";
  }
  function top() { window.scrollTo(0, 0); }

  function fetchJSON(path) {
    return fetch(path, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("Không tìm thấy file " + path + " (mã " + r.status + ").");
      return r.text();
    }).then(function (txt) {
      try { return JSON.parse(txt); }
      catch (e) { throw new Error("File " + path + " bị lỗi định dạng JSON: " + e.message + ". Hãy kiểm tra file bằng một trang JSON validator."); }
    }, function (e) {
      if (location.protocol === "file:") throw new Error("Trình duyệt không cho đọc file dữ liệu khi mở trang bằng cách bấm đúp. Hãy mở trang qua GitHub Pages hoặc một server nhỏ (ví dụ VS Code + Live Server).");
      throw e;
    });
  }
  function errorBox(e) { return '<div class="err"><b>Không tải được dữ liệu.</b><br>' + esc(e.message || e) + "</div>"; }
  function getRegistry() {
    if (registry) return Promise.resolve(registry);
    return fetchJSON(DS_MON).then(function (d) { registry = d; return d; });
  }
  function getSubject(m) {
    if (subjects[m.ma_mon]) return Promise.resolve(subjects[m.ma_mon]);
    return fetchJSON(m.file_cau_hoi).then(function (d) { subjects[m.ma_mon] = d; return d; });
  }
  function findSubject(ma) { return (registry.mon || []).filter(function (m) { return m.ma_mon === ma; })[0]; }
  function findChapter(d, id) { return d ? d.chuong.filter(function (c) { return c.id === id; })[0] : null; }
  function chapLabel(ch, pos) {
    if (/^Chương\s+Thực tập/i.test(ch.ten)) return "TT";
    if (ch.nhom === "Bài tập") return "BT";
    var m = ch.ten.match(/(\d+(?:-\d+)?)(?:\s+([A-ZĐ]{2,4})\b)?/), n = m ? m[1] + (m[2] ? "-" + m[2] : "") : String(pos);
    return (ch.nhom === "PerfectEN" ? "E" : "") + n;
  }
  function chapShort(ch) { return ch.ten.replace(/^Chương\s+(?=Thực tập)/, "").replace(/^(Chương|Bài|Tuần|PerfectEN)\s*\d+(?:-\d+)?(?:\s+[A-ZĐ]{2,4})?\s*-\s*/, ""); }
  function chapPos(d, ch) { return d.chuong.indexOf(ch) + 1; }
  /* khu: "hien-tai" = môn của người dùng, "tong" = môn của người khác. Thiếu thì là "hien-tai". */
  function khuOf(m) { return m && m.khu === "tong" ? "tong" : "hien-tai"; }
  function khuOfCode(ma) { return khuOf(findSubject(ma)); }
  function initials(t) { var w = t.split(/\s+/).filter(function (x) { return /[A-Za-zÀ-ỹ0-9]/.test(x); }); return w.length > 1 ? (w[0][0] + w[1][0]).toUpperCase() : t.slice(0, 3).toUpperCase(); }
  /* Biểu tượng môn: trường "icon" trong danh-sach-mon.json. File .svg (hình nét một màu) được tô theo màu của web,
     ảnh khác (.png, .jpg, .webp) hiện nguyên màu. Không có thì hiện chữ viết tắt. */
  function subjectBadge(m) {
    if (m.icon && /\.svg$/i.test(m.icon)) { var u = "url('" + esc(m.icon) + "')"; return '<span class="badge icon" aria-hidden="true"><i style="-webkit-mask-image:' + u + ";mask-image:" + u + '"></i></span>'; }
    if (m.icon) return '<span class="badge photo"><img src="' + esc(m.icon) + '" alt="" loading="lazy"></span>';
    return '<span class="badge">' + esc(initials(m.ten)) + "</span>";
  }
  function docsOfChapter(m, chId) { return (m.tai_lieu || []).filter(function (t) { return t.chuong === chId; }); }

  /* ---------- Hộp thoại và thông báo (không dùng confirm của trình duyệt) ---------- */
  function modal(opt) {
    /* opt: title, body (html), okText, cancelText, wait (giây phải chờ trước khi bấm được), danger, onOk */
    var wrap = document.createElement("div");
    wrap.className = "modal-wrap";
    wrap.innerHTML = '<div class="modal panel" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">' + esc(opt.title) + "</h2>"
      + '<div class="modal-body">' + opt.body + '</div><div class="row-actions modal-actions"><button class="btn" id="modal-cancel">' + esc(opt.cancelText || "Hủy") + "</button>"
      + '<button class="btn primary' + (opt.danger ? " danger" : "") + '" id="modal-ok"></button></div></div>';
    document.body.appendChild(wrap);
    var ok = wrap.querySelector("#modal-ok"), left = opt.wait || 0, timer = null;
    function paint() { ok.textContent = opt.okText + (left > 0 ? " (" + left + ")" : ""); ok.disabled = left > 0; }
    function close() { if (timer) clearInterval(timer); document.removeEventListener("keydown", onKey, true); wrap.remove(); }
    function onKey(e) { if (e.key === "Escape") { close(); e.stopPropagation(); } }
    paint();
    if (left > 0) timer = setInterval(function () { left--; paint(); if (left <= 0) { clearInterval(timer); timer = null; } }, 1000);
    wrap.querySelector("#modal-cancel").onclick = close;
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    ok.onclick = function () { if (ok.disabled) return; close(); opt.onOk(); };
    document.addEventListener("keydown", onKey, true);
    wrap.querySelector("#modal-cancel").focus();
  }
  var toastTimer = null;
  function toast(text, undo) {
    var old = document.querySelector(".toast"); if (old) old.remove();
    if (toastTimer) clearTimeout(toastTimer);
    var t = document.createElement("div");
    t.className = "toast"; t.setAttribute("role", "status");
    t.innerHTML = "<span>" + esc(text) + "</span>" + (undo ? '<button class="link-btn" id="toast-undo">Hoàn tác</button>' : "");
    document.body.appendChild(t);
    if (undo) t.querySelector("#toast-undo").onclick = function () { t.remove(); undo(); };
    toastTimer = setTimeout(function () { t.remove(); }, 5000);
  }

  /* ---------- Sổ ôn tập: câu đã lưu và số lần sai (chỉ trên máy này) ---------- */
  /* so-on-tap:luu = { ma_mon: { id_câu: thời điểm lưu } }
     so-on-tap:sai = { ma_mon: { id_câu: { sai: số lần sai, dung: số lần đúng liên tiếp } } } */
  function savedAll() { return load("so-on-tap:luu") || {}; }
  function statsAll() { return load("so-on-tap:sai") || {}; }
  function isSaved(ma, id) { var a = savedAll(); return !!(a[ma] && a[ma][id]); }
  function setSaved(ma, id, on) {
    var a = savedAll(); a[ma] = a[ma] || {};
    if (on) a[ma][id] = Date.now(); else delete a[ma][id];
    if (!Object.keys(a[ma]).length) delete a[ma];
    store("so-on-tap:luu", a);
  }
  /* Sai thì cộng 1 lần sai và đếm lại số lần đúng. Đúng 2 lần liên tiếp thì câu rời danh sách (số lần sai về 0). */
  function recordAnswer(ma, id, ok) {
    var a = statsAll(), m = a[ma] || (a[ma] = {}), r = m[id];
    if (ok) { if (r) { r.dung = (r.dung || 0) + 1; if (r.dung >= 2) delete m[id]; } }
    else { r = r || { sai: 0, dung: 0 }; r.sai++; r.dung = 0; m[id] = r; }
    if (!Object.keys(m).length) delete a[ma];
    store("so-on-tap:sai", a);
  }
  function wrongCount(ma, id) { var a = statsAll(); return a[ma] && a[ma][id] ? a[ma][id].sai : 0; }
  function heartBtn(ma, id) {
    var on = isSaved(ma, id);
    return '<button class="heart' + (on ? " on" : "") + '" data-heart="' + esc(ma) + "|" + esc(id) + '" aria-pressed="' + on + '" title="' + (on ? "Bỏ lưu câu này" : "Lưu vào Sổ ôn tập") + '" aria-label="Lưu câu vào Sổ ôn tập">' + HEART + "</button>";
  }
  function wireHearts(root, after) {
    root.querySelectorAll("[data-heart]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var p = b.getAttribute("data-heart").split("|"), on = !isSaved(p[0], p[1]);
        setSaved(p[0], p[1], on);
        b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
        b.title = on ? "Bỏ lưu câu này" : "Lưu vào Sổ ôn tập";
        if (on) { b.classList.remove("pulse"); void b.offsetWidth; b.classList.add("pulse"); }
        if (after) after(p[0], p[1], on); else toast(on ? "Đã lưu vào Sổ ôn tập." : "Đã bỏ lưu câu này.");
      });
    });
  }

  /* ---------- Lịch sử làm bài (chỉ các lần đã làm xong) ---------- */
  var MODE_NAME = { "chuong": "Theo chương", "lai-sai": "Làm lại câu sai", "thi-luyen": "Thi thử, luyện tập", "thi-that": "Thi thử, thi thật" };
  function logHistory(s, right, total) {
    if (s.logged) return;
    s.logged = true;
    var h = load("lich-su") || [];
    h.unshift({ t: Date.now(), ma: s.d.ma_mon, mon: s.d.mon, ten: s.title,
      che_do: s.retry ? "lai-sai" : s.kind === "thi" ? (s.mode === "that" ? "thi-that" : "thi-luyen") : "chuong",
      dung: right, tong: total, giay: Math.round((s.ms || 0) / 1000) });
    store("lich-su", h.slice(0, HISTORY_MAX));
  }

  /* ---------- Điều hướng ---------- */
  var ROUTES = { "trang-chu": home, "trac-nghiem": function () { quizRoute("hien-tai"); }, "trac-nghiem-tong": function () { quizRoute("tong"); },
    "tai-lieu": docs, "so-on-tap": function () { notebook(false); }, "lich-su": historyView };
  function route() {
    var r = (location.hash || "").replace("#", "");
    if (!ROUTES[r]) r = "trang-chu";
    document.querySelectorAll(".tab, .dtab").forEach(function (t) {
      if (t.getAttribute("href") === "#" + r) {
        t.setAttribute("aria-current", "page");
        var bar = t.parentNode; if (t.classList.contains("tab") && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = t.offsetLeft - 16;
      } else t.removeAttribute("aria-current");
    });
    ROUTES[r]();
  }
  window.addEventListener("hashchange", function () { route(); top(); });

  /* ================= TRANG CHỦ =================
     Trang giới thiệu MichielEdu: web là gì, người làm là ai, vì sao làm. Số liệu và danh sách môn lấy trực tiếp từ dữ liệu. */
  var ABOUT = {
    ten: "Nguyễn Xuân Tùng", biet_danh: "Michiel", nam_sinh: 2007, khoa: "Khóa 25 (2025)",
    nganh: "Nhóm ngành Máy tính và Công nghệ thông tin", truong: "Trường Đại học Khoa học Tự nhiên, ĐHQG-HCM",
    anh: "images/anh-dai-dien.jpg", facebook: "https://www.facebook.com/xtung09/"
  };
  var LINK_ICON = { fb: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>' };
  function linksHTML() {
    return '<div class="h-links"><a class="h-link" href="' + esc(ABOUT.facebook) + '" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true">' + LINK_ICON.fb + "</svg><span>Facebook <small>xtung09</small></span></a>"
      + "</div>";
  }

  function home() {
    render('<p class="loading">Đang tải...</p>', "loading");
    getRegistry().then(function (reg) {
      var withQ = reg.mon.filter(function (m) { return m.file_cau_hoi; });
      return Promise.all(withQ.map(function (m) { return getSubject(m).catch(function () { return null; }); })).then(function (list) {
        var nQ = 0, nC = 0, nHard = 0, pool = [];
        list.forEach(function (d, i) {
          if (!d) return;
          d.chuong.forEach(function (c) {
            if (!c.cau.length) return;
            nC++; nQ += c.cau.length;
            c.cau.forEach(function (q) {
              if (q.kho) nHard++;
              if (q.hoi.length < 120 && !/[$\n]/.test(q.hoi + q.dap_an.join("")) && q.dap_an.every(function (a) { return a.length <= 70; }))
                pool.push({ q: q, m: withQ[i], d: d, ch: c });
            });
          });
        });
        var nDoc = reg.mon.reduce(function (s, m) { return s + (m.tai_lieu || []).length; }, 0);
        var sample = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
        var age = new Date().getFullYear() - ABOUT.nam_sinh;

        var h = '<section class="h-hero"><div class="h-hero-text">'
          + '<span class="eyebrow">Dự án học tập phi lợi nhuận</span>'
          + '<h1 class="h-title">Michiel<span class="hl">Edu</span></h1>'
          + '<p class="h-lead">Ôn bài bằng trắc nghiệm theo từng chương, đọc tóm tắt ngắn gọn, thi thử có đếm giờ. Miễn phí cho mọi người, không cần tài khoản.</p>'
          + '<div class="row-actions"><a class="btn primary" href="#trac-nghiem">Bắt đầu ôn tập</a><button class="btn" data-scroll="ve-minh">Về người làm</button></div>'
          + '</div>' + sampleCard(sample) + "</section>"

          + '<div class="h-stats">'
          + stat(withQ.length, "môn học") + stat(nC, "chương") + stat(nQ, "câu hỏi", nHard + " câu khó") + stat(nDoc, "bản tóm tắt PDF")
          + "</div>"

          + '<section class="h-sec" id="ve-minh"><div class="h-sec-head"><span class="eyebrow">Người làm</span><h2>Chào bạn, mình là Tùng</h2></div>'
          + '<div class="h-about">' + idCard(age)
          + '<div class="h-about-text"><p>Mình là <b>' + esc(ABOUT.ten) + "</b>, hay dùng tên <b>" + esc(ABOUT.biet_danh) + "</b>. Mình sinh năm " + ABOUT.nam_sinh
          + ", là sinh viên " + esc(ABOUT.khoa.toLowerCase()) + ", " + esc(ABOUT.nganh.toLowerCase()) + " tại " + esc(ABOUT.truong) + ".</p>"
          + "<p>MichielEdu bắt đầu từ việc mình tự soạn tóm tắt và câu hỏi để ôn bài cho chính mình. Làm xong thấy có ích, nên mình gom lại thành một trang web để bạn bè và mọi người cùng dùng.</p>"
          + '<p class="small muted">Góp ý, báo lỗi câu hỏi hay muốn trò chuyện thì nhắn mình qua Facebook:</p>' + linksHTML() + "</div></div></section>"

          + '<section class="h-sec"><div class="h-sec-head"><span class="eyebrow">Vì sao có trang này</span><h2>Học cho mình, chia sẻ cho mọi người</h2></div>'
          + '<p class="h-sec-lead">MichielEdu phục vụ việc học và để chia sẻ. Đây là dự án phi lợi nhuận: không thu phí, không quảng cáo, chỉ nhằm giúp mọi người học tốt hơn.</p>'
          + '<div class="h-values">'
          + value("free", "Miễn phí, phi lợi nhuận", "Không thu phí, không quảng cáo. Ai cần ôn bài đều dùng được.")
          + value("lock", "Không cần tài khoản", "Mở là làm. Tiến độ, câu đã lưu và lịch sử chỉ nằm trên trình duyệt của bạn.")
          + value("book", "Bám sát bài giảng", "Tóm tắt và câu hỏi soạn theo slide của từng chương, mỗi câu có giải thích và ghi nguồn.")
          + "</div></section>"

          + '<section class="h-sec"><div class="h-sec-head"><span class="eyebrow">Trang này có gì</span><h2>Mọi thứ để ôn một môn</h2></div><div class="features">'
          + feature(0, "Trắc nghiệm theo chương", "Bốn đáp án, chọn là biết đúng sai và đọc giải thích ngay. Thứ tự đáp án được đảo mỗi lần làm.")
          + feature(1, "Thi thử có đếm giờ", "Tự chọn chương, số câu và thời gian. Đề lấy nửa câu thường, nửa câu khó, nộp bài mới biết điểm.")
          + feature(2, "Sổ ôn tập", "Bấm trái tim để lưu câu cần nhớ. Câu sai từ 2 lần trở lên tự vào sổ để đọc lại.")
          + feature(3, "Tóm tắt từng chương", "Bản PDF ngắn gọn nằm ngay cạnh chương, đọc lướt trước khi làm bài.")
          + feature(0, "Lịch sử và làm tiếp", "Ghi lại các lần làm xong. Bỏ dở giữa chừng thì quay lại làm tiếp đúng câu đó.")
          + feature(1, "Công thức và code rõ ràng", "Công thức toán hiển thị như sách, đoạn code giữ nguyên thụt lề. Có nền sáng và nền tối.")
          + "</div></section>"

          + '<section class="h-sec"><div class="h-sec-head"><span class="eyebrow">Các môn đang có</span><h2>' + withQ.length + " môn, " + nQ.toLocaleString("vi-VN") + " câu hỏi</h2></div>";
        [["hien-tai", "Môn học kỳ này", "Trắc nghiệm"], ["tong", "Môn học khác", "Trắc nghiệm Tổng"]].forEach(function (g, gi) {
          var ms = withQ.filter(function (m) { return khuOf(m) === g[0]; });
          if (!ms.length) return;
          h += '<div class="stack"><div class="section-title" style="--c:' + wire(gi * 2) + '">' + g[1] + ' <span class="muted small">· mục ' + g[2] + '</span></div><div class="h-subjects">';
          ms.forEach(function (m, i) {
            var d = list[withQ.indexOf(m)], n = 0, c = 0;
            if (d) d.chuong.forEach(function (ch) { if (ch.cau.length) { c++; n += ch.cau.length; } });
            h += '<button class="h-subj" style="--c:' + wire(i + gi) + '" data-open="' + esc(m.ma_mon) + '">' + subjectBadge(m)
              + '<span class="h-subj-body"><b>' + esc(m.ten) + "</b><span>" + c + " chương · " + n + " câu</span></span></button>";
          });
          h += "</div></div>";
        });
        h += "</section>"
          + '<footer class="h-foot"><span class="brand-mark">' + logoSVG() + "</span><div><b>MichielEdu</b><span>Dự án học tập phi lợi nhuận của " + esc(ABOUT.ten) + ", " + new Date().getFullYear() + ".</span>"
          + "<span>Dữ liệu học của bạn chỉ lưu trên trình duyệt này.</span></div>"
          + '<div class="h-foot-links"><a href="' + esc(ABOUT.facebook) + '" target="_blank" rel="noopener">Facebook</a></div></footer>';
        render(h, "home");
        main.querySelectorAll("[data-scroll]").forEach(function (b) { b.addEventListener("click", function () { document.getElementById(b.getAttribute("data-scroll")).scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" }); }); });
        main.querySelectorAll("[data-open]").forEach(function (b) {
          b.addEventListener("click", function () {
            var m = findSubject(b.getAttribute("data-open")), k = khuOf(m);
            quiz = { view: "chuong", mon: m.ma_mon, khu: k };
            location.hash = k === "tong" ? "#trac-nghiem-tong" : "#trac-nghiem";
          });
        });
        wireSample(sample);
      });
    }).catch(function (e) { render(errorBox(e), "err"); });
  }
  function stat(n, label, sub) { return '<div class="h-stat"><strong>' + n.toLocaleString("vi-VN") + "</strong><span>" + esc(label) + "</span>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</div>"; }
  function value(icon, t, d) {
    var I = { free: '<path d="M12 21s-7-4.4-9-9c-1.3-3 .7-7 4.5-7 2 0 3.4 1 4.5 2.6C13.1 6 14.5 5 16.5 5c3.8 0 5.8 4 4.5 7-2 4.6-9 9-9 9z"/>',
      lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
      book: '<path d="M3 5.5C6 4.5 9 4.8 12 7c3-2.2 6-2.5 9-1.5V19c-3-1-6-.7-9 1.5-3-2.2-6-2.5-9-1.5z"/><path d="M12 7v13.5"/>' };
    return '<div class="h-value"><span class="h-value-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' + I[icon] + "</svg></span><h3>" + esc(t) + "</h3><p>" + esc(d) + "</p></div>";
  }
  function feature(i, t, d) { return '<div class="panel feature" style="--c:' + wire(i) + '"><h3><i aria-hidden="true"></i>' + esc(t) + "</h3><p>" + esc(d) + "</p></div>"; }
  /* Thẻ sinh viên: chỉ ghi thông tin người dùng đã cung cấp */
  function idCard(age) {
    return '<div class="id-card" aria-label="Thẻ giới thiệu"><div class="id-top"><span class="brand-mark">' + logoSVG() + '</span><span>MichielEdu</span><em>Người làm</em></div>'
      + '<div class="id-body"><div class="id-avatar"><img src="' + esc(ABOUT.anh) + '" alt="Ảnh ' + esc(ABOUT.ten) + '" loading="lazy"></div><dl>'
      + "<div><dt>Họ và tên</dt><dd>" + esc(ABOUT.ten) + "</dd></div>"
      + "<div><dt>Năm sinh</dt><dd>" + ABOUT.nam_sinh + "</dd></div>"
      + "<div><dt>Khóa</dt><dd>" + esc(ABOUT.khoa) + "</dd></div>"
      + "<div><dt>Ngành</dt><dd>" + esc(ABOUT.nganh) + "</dd></div>"
      + "</dl></div><div class=\"id-foot\">" + esc(ABOUT.truong) + "</div></div>";
  }
  function logoSVG() { var el = document.querySelector(".topnav [data-logo]"); return el ? el.innerHTML : ""; }
  /* Câu hỏi thử ở đầu trang: lấy ngẫu nhiên một câu ngắn trong dữ liệu, bấm để xem đáp án. Không tính vào thống kê. */
  function sampleCard(x) {
    if (!x) return "";
    var order = shuffle([0, 1, 2, 3]);
    x.order = order;
    var h = '<div class="h-sample panel" aria-label="Thử một câu"><div class="h-sample-head"><span class="tag ch">' + esc(x.m.ten) + " · " + esc(chapLabel(x.ch, chapPos(x.d, x.ch))) + '</span><span class="small muted">Thử một câu</span></div>'
      + '<p class="h-sample-q">' + esc(x.q.hoi) + '</p><div class="opts">';
    order.forEach(function (dIdx, pos) {
      h += '<button class="opt" data-sp="' + pos + '"><span class="key">' + KEYS[pos] + '</span><span class="txt">' + esc(x.q.dap_an[dIdx]) + "</span>" + (dIdx === 0 ? MARK_OK : MARK_BAD) + "</button>";
    });
    return h + '</div><div class="h-sample-foot" id="h-sample-foot"><span class="small muted">Câu lấy ngẫu nhiên từ ' + esc(x.ch.ten) + ".</span></div></div>";
  }
  function wireSample(x) {
    if (!x) return;
    main.querySelectorAll("[data-sp]").forEach(function (o) {
      o.addEventListener("click", function () {
        var pos = +o.getAttribute("data-sp"), ok = x.order[pos] === 0;
        main.querySelectorAll("[data-sp]").forEach(function (b) {
          var p = +b.getAttribute("data-sp"); b.disabled = true;
          b.classList.add(x.order[p] === 0 ? "right" : p === pos ? "wrong" : "dim");
        });
        document.getElementById("h-sample-foot").innerHTML = '<span class="verdict ' + (ok ? "ans-ok" : "ans-bad") + '">' + (ok ? "Chính xác!" : "Chưa đúng.") + "</span>"
          + '<button class="link-btn" id="h-sample-go">Làm cả chương này</button>';
        document.getElementById("h-sample-go").onclick = function () {
          var k = khuOf(x.m); quiz = { view: "chuong", mon: x.m.ma_mon, khu: k }; location.hash = k === "tong" ? "#trac-nghiem-tong" : "#trac-nghiem";
        };
      });
    });
  }

  /* ================= TRẮC NGHIỆM ================= */
  function quizRoute(khu) {
    render('<p class="loading">Đang tải...</p>', "loading");
    getRegistry().then(function () {
      if (quiz.khu !== khu) return subjectsView(khu);
      if (quiz.view === "quiz" && quiz.s) return renderQuiz(0);
      if (quiz.view === "ketqua" && quiz.s) return results();
      if (quiz.view === "thi" && quiz.mon) return examSetup(quiz.mon);
      if (quiz.view === "chuong" && quiz.mon) return chapters(quiz.mon);
      subjectsView(khu);
    }).catch(function (e) { render(errorBox(e), "err"); });
  }

  function subjectsView(khu) {
    khu = khu === "tong" ? "tong" : "hien-tai";
    quiz = { view: "mon", khu: khu };
    var list = registry.mon.filter(function (m) { return khuOf(m) === khu; });
    var h = '<div class="stack"><h1>' + (khu === "tong" ? "Trắc nghiệm Tổng" : "Trắc nghiệm môn học") + '</h1><p class="muted">'
      + (khu === "tong" ? "Tổng hợp các môn học khác nhau. Chọn môn để xem các chương." : "Chọn môn để xem các chương.") + '</p></div><div class="panel list">';
    if (!list.length) h += '<div class="item" aria-disabled="true"><span class="item-body"><span class="item-meta">Chưa có môn nào</span></span></div>';
    list.forEach(function (m, i) {
      var ok = !!m.file_cau_hoi;
      h += '<button class="item" style="--c:' + wire(i) + '" data-mon="' + esc(m.ma_mon) + '"' + (ok ? "" : " disabled") + ">"
        + subjectBadge(m)
        + '<span class="item-body"><span class="item-name">' + esc(m.ten) + "</span>"
        + '<span class="item-meta" data-meta="' + esc(m.ma_mon) + '">' + (ok ? "Đang tải số câu..." : "Chưa có câu hỏi") + "</span></span>"
        + (ok ? '<span class="item-go">Chọn</span>' : '<span class="item-go soon">Sắp có</span>') + "</button>";
    });
    h += "</div>";
    render(h, "mon");
    main.querySelectorAll(".item[data-mon]").forEach(function (b) {
      b.addEventListener("click", function () { chapters(b.getAttribute("data-mon")); top(); });
    });
    list.filter(function (m) { return m.file_cau_hoi; }).forEach(function (m) {
      getSubject(m).then(function (d) {
        var n = 0, c = 0; d.chuong.forEach(function (ch) { if (ch.cau.length) { c++; n += ch.cau.length; } });
        var el = main.querySelector('[data-meta="' + m.ma_mon + '"]'); if (el) el.textContent = c + " chương, " + n + " câu";
      }).catch(function (e) {
        var el = main.querySelector('[data-meta="' + m.ma_mon + '"]'); if (el) el.textContent = "Lỗi tải câu hỏi: " + (e.message || e);
      });
    });
  }

  function chapters(ma) {
    var m = findSubject(ma); if (!m) return subjectsView(quiz.khu);
    var khu = khuOf(m);
    quiz = { view: "chuong", mon: ma, khu: khu };
    render('<p class="loading">Đang tải câu hỏi...</p>', "loading");
    getSubject(m).then(function (d) {
      var shuffleOn = load("xao-tron") === true, groups = [], idx = 0;
      d.chuong.forEach(function (ch) {
        var g = groups.filter(function (x) { return x.name === ch.nhom; })[0];
        if (!g) { g = { name: ch.nhom || "Khác", items: [] }; groups.push(g); }
        g.items.push(ch);
      });
      var ex = examProgress(d);
      var h = '<div class="crumbs"><button class="link-btn" id="ve-mon">Tất cả môn</button><span>/</span><span>' + esc(d.mon) + "</span></div>"
        + '<div class="stack"><h1>' + esc(d.mon) + '</h1><p class="muted">Chọn một chương để làm bài, hoặc thi thử nhiều chương.</p></div>'
        + '<button class="panel exam-entry" id="thi-thu"><span class="exam-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg></span>'
        + '<span class="item-body"><span class="item-name">Thi thử</span><span class="item-meta">'
        + (ex ? '<span class="resume">Đang làm dở: ' + esc(ex.title) + (ex.mode === "that" ? ", còn " + clock(ex.exam.left) : "") + "</span>" : "Chọn chương, số câu và thời gian. Nửa câu thường, nửa câu khó.")
        + '</span></span><span class="item-go">' + (ex ? "Làm tiếp" : "Thiết lập") + "</span></button>"
        + '<label class="panel toggle" for="xao-tron"><input type="checkbox" id="xao-tron"' + (shuffleOn ? " checked" : "") + ">"
        + '<span class="switch" aria-hidden="true"></span><span class="toggle-text"><b>Xáo trộn thứ tự câu hỏi</b>'
        + '<span class="small muted">Áp dụng khi bắt đầu một lượt mới. Thứ tự đáp án luôn được đảo.</span></span></label>';
      groups.forEach(function (g, gi) {
        h += '<section class="stack"><div class="section-title" style="--c:' + wire(gi * 2) + '">' + esc(g.name) + '</div><div class="panel list">';
        g.items.forEach(function (ch) {
          var n = ch.cau.length, k = ch.cau.filter(function (q) { return q.kho; }).length;
          var meta = n ? n + " câu, " + k + " câu khó" : "Chưa có câu hỏi", meter = "";
          var prog = n ? validProgress(d, ch) : null, last = load("diem:" + d.ma_mon + ":" + ch.id);
          if (prog) {
            var done = prog.picks.filter(function (x) { return x !== null; }).length;
            meta += '. <span class="resume">Đang làm dở câu ' + (prog.cur + 1) + "/" + prog.ids.length + "</span>";
            meter = '<span class="meter prog"><i style="width:' + (done * 100 / prog.ids.length) + '%"></i></span>';
          } else if (last) {
            meta += ". Lần trước: " + last.dung + "/" + last.tong + " câu đúng";
            meter = '<span class="meter"><i style="width:' + (last.dung * 100 / last.tong) + '%"></i></span>';
          }
          var cdocs = docsOfChapter(m, ch.id);
          h += '<div class="item-row' + (cdocs.length ? " has-doc" : "") + '"><button class="item" style="--c:' + wire(idx++) + '" data-ch="' + esc(ch.id) + '"' + (n ? "" : " disabled") + ">"
            + '<span class="badge">' + esc(chapLabel(ch, chapPos(d, ch))) + "</span>"
            + '<span class="item-body"><span class="item-name">' + esc(chapShort(ch)) + '</span><span class="item-meta">' + meta + "</span>" + meter + "</span>"
            + (n ? '<span class="item-go">' + (prog ? "Làm tiếp" : "Làm bài") + "</span>" : "") + "</button>";
          cdocs.forEach(function (t) {
            h += '<a class="doc-chip" href="' + esc(t.file) + '" target="_blank" rel="noopener" title="Mở tóm tắt: ' + esc(t.ten) + '">' + PDF_ICON + "<span>Tóm tắt</span></a>";
          });
          h += "</div>";
        });
        h += "</div></section>";
      });
      render(h, "chuong:" + ma);
      document.getElementById("ve-mon").onclick = function () { subjectsView(khu); top(); };
      document.getElementById("thi-thu").onclick = function () { examSetup(ma); top(); };
      document.getElementById("xao-tron").addEventListener("change", function (e) { store("xao-tron", e.target.checked); });
      main.querySelectorAll(".item[data-ch]").forEach(function (b) {
        b.addEventListener("click", function () {
          var ch = findChapter(d, b.getAttribute("data-ch"));
          var prog = validProgress(d, ch);
          if (prog) resumeView(d, ch, prog); else start(d, ch);
          top();
        });
      });
    }).catch(function (e) {
      render('<div class="crumbs"><button class="link-btn" id="ve-mon">Tất cả môn</button></div>' + errorBox(e), "err");
      document.getElementById("ve-mon").onclick = function () { subjectsView(khu); };
    });
  }

  /* ----- Phiên làm bài -----
     s = { d, kind: "chuong" | "thi", ch (khi theo chương), title, mode: "luyen" | "that", retry,
           items: [{ q, chId, order, pick }], cur, streak, ms (thời gian làm), exam: { chs, n, minutes, left }, key } */
  function progKey(d, ch) { return "tien-do:" + d.ma_mon + ":" + ch.id; }
  function examKey(d) { return "thi-thu:" + d.ma_mon; }
  function save() {
    var s = quiz.s; if (!s || s.finished) return;
    var o = { ids: s.items.map(function (it) { return it.q.id; }), orders: s.items.map(function (it) { return it.order; }),
      picks: s.items.map(function (it) { return it.pick; }), cur: s.cur, retry: s.retry, streak: s.streak, ms: s.ms || 0 };
    if (s.kind === "thi") { o.kind = "thi"; o.mode = s.mode; o.title = s.title; o.exam = s.exam; }
    store(s.key, o);
  }
  function validProgress(d, ch) {
    var p = load(progKey(d, ch));
    if (!p || !Array.isArray(p.ids) || !p.ids.length) return null;
    var byId = {}; ch.cau.forEach(function (q) { byId[q.id] = true; });
    var keep = p.ids.map(function (id, i) { return byId[id] ? i : -1; }).filter(function (i) { return i >= 0; });
    if (!keep.length) return null;
    if (keep.length !== p.ids.length) {
      p.ids = keep.map(function (i) { return p.ids[i]; });
      p.orders = keep.map(function (i) { return p.orders[i]; });
      p.picks = keep.map(function (i) { return p.picks[i]; });
      p.cur = Math.min(p.cur, p.ids.length - 1);
    }
    if (p.picks.every(function (x) { return x !== null; })) return null;
    return p;
  }
  function questionIndex(d) {
    var byId = {};
    d.chuong.forEach(function (ch) { ch.cau.forEach(function (q) { byId[q.id] = { q: q, chId: ch.id }; }); });
    return byId;
  }
  function examProgress(d) {
    var p = load(examKey(d));
    if (!p || p.kind !== "thi" || !Array.isArray(p.ids)) return null;
    var byId = questionIndex(d), keep = p.ids.map(function (id, i) { return byId[id] ? i : -1; }).filter(function (i) { return i >= 0; });
    if (!keep.length) return null;
    p.ids = keep.map(function (i) { return p.ids[i]; }); p.orders = keep.map(function (i) { return p.orders[i]; }); p.picks = keep.map(function (i) { return p.picks[i]; });
    p.cur = Math.min(p.cur, p.ids.length - 1);
    if (p.mode !== "that" && p.picks.every(function (x) { return x !== null; })) return null;
    return p;
  }
  function sessionFrom(d, p, kind, ch) {
    var byId = questionIndex(d);
    return { d: d, kind: kind, ch: ch, title: kind === "thi" ? p.title : ch.ten + (p.retry ? " (làm lại câu sai)" : ""), mode: p.mode || "luyen", retry: !!p.retry,
      cur: p.cur, streak: p.streak || 0, ms: p.ms || 0, exam: p.exam, key: kind === "thi" ? examKey(d) : progKey(d, ch),
      items: p.ids.map(function (id, i) { return { q: byId[id].q, chId: byId[id].chId, order: p.orders[i], pick: p.picks[i] }; }) };
  }

  function resumeView(d, ch, p) {
    quiz = { view: "chuong", mon: d.ma_mon, khu: khuOfCode(d.ma_mon) };
    var done = p.picks.filter(function (x) { return x !== null; }).length;
    var h = '<div class="crumbs"><button class="link-btn" id="ve-chuong">' + esc(d.mon) + "</button><span>/</span><span>" + esc(chapShort(ch)) + "</span></div>"
      + '<section class="panel resume-box"><h2>' + esc(ch.ten) + "</h2>"
      + "<p>Bạn đang làm dở" + (p.retry ? " lượt làm lại câu sai" : "") + ": đã trả lời " + done + "/" + p.ids.length + " câu, đang ở câu " + (p.cur + 1) + ".</p>"
      + '<span class="meter prog"><i style="width:' + (done * 100 / p.ids.length) + '%"></i></span>'
      + '<div class="row-actions"><button class="btn primary" id="lam-tiep">Làm tiếp từ câu ' + (p.cur + 1) + "</button>"
      + '<button class="btn" id="lam-lai">Làm lại từ đầu</button></div></section>';
    render(h, "resume");
    document.getElementById("ve-chuong").onclick = function () { chapters(d.ma_mon); };
    document.getElementById("lam-tiep").onclick = function () {
      quiz = { view: "quiz", mon: d.ma_mon, khu: khuOfCode(d.ma_mon), s: sessionFrom(d, p, "chuong", ch) };
      renderQuiz(0);
    };
    document.getElementById("lam-lai").onclick = function () { store(progKey(d, ch), null); start(d, ch); };
  }

  function start(d, ch, onlyIds) {
    var qs = onlyIds ? ch.cau.filter(function (q) { return onlyIds.indexOf(q.id) >= 0; }) : ch.cau.slice();
    if (load("xao-tron") === true) qs = shuffle(qs);
    quiz = { view: "quiz", mon: d.ma_mon, khu: khuOfCode(d.ma_mon), s: { d: d, kind: "chuong", ch: ch, title: ch.ten + (onlyIds ? " (làm lại câu sai)" : ""), mode: "luyen",
      cur: 0, retry: !!onlyIds, streak: 0, ms: 0, key: progKey(d, ch),
      items: qs.map(function (q) { return { q: q, chId: ch.id, order: shuffle([0, 1, 2, 3]), pick: null }; }) } };
    save();
    renderQuiz(0);
  }

  /* ================= THI THỬ ================= */
  /* Chia số câu đều cho các chương (chương không đủ câu thì phần thừa chuyển sang chương khác),
     mỗi chương lấy nửa câu khó (làm tròn lên), thiếu câu khó thì bù câu thường. */
  function examPlan(d, chIds, n) {
    var chs = chIds.map(function (id) { return findChapter(d, id); }).filter(function (c) { return c && c.cau.length; });
    var cap = chs.map(function (c) { return c.cau.length; }), alloc = chs.map(function () { return 0; });
    var total = cap.reduce(function (a, b) { return a + b; }, 0), left = Math.min(n, total);
    while (left > 0) {
      var open = chs.map(function (c, i) { return i; }).filter(function (i) { return alloc[i] < cap[i]; });
      if (!open.length) break;
      var share = Math.floor(left / open.length);
      if (!share) { open.slice(0, left).forEach(function (i) { alloc[i]++; }); left = 0; break; }
      open.forEach(function (i) { var add = Math.min(share, cap[i] - alloc[i]); alloc[i] += add; left -= add; });
    }
    return chs.map(function (c, i) {
      var a = alloc[i], hardAll = c.cau.filter(function (q) { return q.kho; }).length, normAll = c.cau.length - hardAll;
      var want = Math.ceil(a / 2), hard = Math.min(want, hardAll), norm = Math.min(a - hard, normAll);
      if (hard + norm < a) hard = Math.min(a - norm, hardAll);
      return { ch: c, n: a, hard: hard, norm: norm, short: hard < want };
    }).filter(function (x) { return x.n > 0; });
  }
  function buildExam(d, cfg) {
    var plan = examPlan(d, cfg.chs, cfg.n), items = [];
    plan.forEach(function (p) {
      var hard = shuffle(p.ch.cau.filter(function (q) { return q.kho; })).slice(0, p.hard);
      var norm = shuffle(p.ch.cau.filter(function (q) { return !q.kho; })).slice(0, p.norm);
      hard.concat(norm).forEach(function (q) { items.push({ q: q, chId: p.ch.id, order: shuffle([0, 1, 2, 3]), pick: null }); });
    });
    items = shuffle(items);
    var title = "Thi thử: " + items.length + " câu, " + plan.length + " chương" + (cfg.mode === "that" ? ", " + cfg.minutes + " phút" : "");
    return { d: d, kind: "thi", title: title, mode: cfg.mode, retry: false, cur: 0, streak: 0, ms: 0, key: examKey(d),
      exam: { chs: cfg.chs, n: cfg.n, minutes: cfg.minutes, left: cfg.minutes * 60 }, items: items };
  }
  function startExam(d, cfg) {
    store("thi-cai-dat:" + d.ma_mon, cfg);
    quiz = { view: "quiz", mon: d.ma_mon, khu: khuOfCode(d.ma_mon), s: buildExam(d, cfg) };
    save(); renderQuiz(0); top();
  }
  function startRetryList(d, items, from) {
    var list = items.map(function (it) { return { q: it.q, chId: it.chId, order: shuffle([0, 1, 2, 3]), pick: null }; });
    if (load("xao-tron") === true) list = shuffle(list);
    quiz = { view: "quiz", mon: d.ma_mon, khu: khuOfCode(d.ma_mon), s: { d: d, kind: "thi", title: "Thi thử: làm lại " + list.length + " câu sai", mode: "luyen", retry: true,
      cur: 0, streak: 0, ms: 0, key: examKey(d), exam: from.exam, items: list } };
    save(); renderQuiz(0); top();
  }

  function examSetup(ma) {
    var m = findSubject(ma); if (!m) return subjectsView(quiz.khu);
    quiz = { view: "thi", mon: ma, khu: khuOf(m) };
    render('<p class="loading">Đang tải câu hỏi...</p>', "loading");
    getSubject(m).then(function (d) {
      var chs = d.chuong.filter(function (c) { return c.cau.length; });
      var prev = load("thi-cai-dat:" + ma) || {};
      var cfg = { chs: (prev.chs || []).filter(function (id) { return findChapter(d, id); }), n: prev.n || 30, mode: prev.mode || "that", minutes: prev.minutes || 45 };
      if (!cfg.chs.length) cfg.chs = chs.map(function (c) { return c.id; });
      var ex = examProgress(d);
      var h = '<div class="crumbs"><button class="link-btn" id="ve-chuong">' + esc(d.mon) + '</button><span>/</span><span>Thi thử</span></div>'
        + '<div class="stack"><h1>Thi thử</h1><p class="muted">Chọn chương, số câu và chế độ. Câu hỏi được chia đều cho các chương, mỗi chương lấy nửa câu thường và nửa câu khó.</p></div>';
      if (ex) {
        var done = ex.picks.filter(function (x) { return x !== null; }).length;
        h += '<section class="panel resume-box"><h2>Bài thi đang làm dở</h2><p>' + esc(ex.title) + ". Đã " + (ex.mode === "that" ? "chọn" : "trả lời") + " " + done + "/" + ex.ids.length + " câu"
          + (ex.mode === "that" ? ", còn <b>" + clock(ex.exam.left) + "</b>. Đồng hồ đang dừng." : ".") + "</p>"
          + '<div class="row-actions"><button class="btn primary" id="thi-tiep">Làm tiếp</button><button class="btn" id="thi-bo">Bỏ bài này</button></div></section>';
      }
      h += '<section class="panel form"><div class="field"><div class="field-head"><b>Chương</b><button class="link-btn" id="chon-het"></button></div><div class="checks">';
      chs.forEach(function (c) {
        var k = c.cau.filter(function (q) { return q.kho; }).length;
        h += '<label class="check"><input type="checkbox" value="' + esc(c.id) + '"' + (cfg.chs.indexOf(c.id) >= 0 ? " checked" : "") + '><span class="check-box" aria-hidden="true"></span>'
          + '<span class="badge sm">' + esc(chapLabel(c, chapPos(d, c))) + '</span><span class="check-text"><span>' + esc(chapShort(c)) + '</span><span class="small muted">' + c.cau.length + " câu, " + k + " khó</span></span></label>";
      });
      h += '</div></div>'
        + '<div class="field"><label class="field-head" for="so-cau"><b>Số câu</b></label><div class="inline"><input type="number" id="so-cau" min="1" inputmode="numeric" value="' + cfg.n + '">'
        + '<div class="chips" data-for="so-cau">' + [20, 30, 40, 50].map(function (x) { return '<button class="chip" data-v="' + x + '">' + x + "</button>"; }).join("") + "</div></div></div>"
        + '<div class="field"><div class="field-head"><b>Chế độ</b></div><div class="modes">'
        + '<label class="mode"><input type="radio" name="che-do" value="luyen"' + (cfg.mode === "luyen" ? " checked" : "") + '><span><b>Luyện tập</b><span class="small muted">Chọn là biết đúng sai và xem giải thích. Không giới hạn thời gian.</span></span></label>'
        + '<label class="mode"><input type="radio" name="che-do" value="that"' + (cfg.mode === "that" ? " checked" : "") + '><span><b>Thi thật</b><span class="small muted">Đếm ngược thời gian, đổi được đáp án. Nộp bài hoặc hết giờ mới biết điểm.</span></span></label>'
        + "</div></div>"
        + '<div class="field" id="field-time"><label class="field-head" for="thoi-gian"><b>Thời gian (phút)</b></label><div class="inline"><input type="number" id="thoi-gian" min="1" max="300" inputmode="numeric" value="' + cfg.minutes + '">'
        + '<div class="chips" data-for="thoi-gian">' + [15, 30, 45, 60, 90].map(function (x) { return '<button class="chip" data-v="' + x + '">' + x + "</button>"; }).join("") + "</div></div></div>"
        + '<div class="plan" id="plan" aria-live="polite"></div>'
        + '<div class="row-actions"><button class="btn primary" id="bat-dau">Bắt đầu</button></div></section>';
      render(h, "thi:" + ma);
      var boxes = main.querySelectorAll(".check input"), nIn = document.getElementById("so-cau"), tIn = document.getElementById("thoi-gian");
      function read() {
        cfg.chs = [].filter.call(boxes, function (b) { return b.checked; }).map(function (b) { return b.value; });
        cfg.n = Math.max(1, parseInt(nIn.value, 10) || 0);
        cfg.mode = main.querySelector('input[name="che-do"]:checked').value;
        cfg.minutes = Math.min(300, Math.max(1, parseInt(tIn.value, 10) || 0));
      }
      function paint() {
        read();
        document.getElementById("field-time").hidden = cfg.mode !== "that";
        var all = [].every.call(boxes, function (b) { return b.checked; });
        document.getElementById("chon-het").textContent = all ? "Bỏ chọn tất cả" : "Chọn tất cả";
        main.querySelectorAll(".chips").forEach(function (g) { var v = document.getElementById(g.getAttribute("data-for")).value; g.querySelectorAll(".chip").forEach(function (c) { c.classList.toggle("on", c.getAttribute("data-v") === String(v)); }); });
        var pl = document.getElementById("plan"), go = document.getElementById("bat-dau");
        if (!cfg.chs.length) { pl.innerHTML = '<p class="warn">Chọn ít nhất một chương.</p>'; go.disabled = true; return; }
        var plan = examPlan(d, cfg.chs, cfg.n), got = plan.reduce(function (a, p) { return a + p.n; }, 0);
        var hardT = plan.reduce(function (a, p) { return a + p.hard; }, 0);
        var rows = plan.map(function (p) {
          return '<li><span class="badge sm">' + esc(chapLabel(p.ch, chapPos(d, p.ch))) + "</span><span>" + p.n + " câu: " + p.norm + " thường, " + p.hard + " khó"
            + (p.short ? ' <span class="note">(thiếu câu khó, đã bù câu thường)</span>' : "") + "</span></li>";
        }).join("");
        pl.innerHTML = "<p><b>Đề gồm " + got + " câu</b> (" + (got - hardT) + " thường, " + hardT + " khó)" + (cfg.mode === "that" ? ", làm trong " + cfg.minutes + " phút" : "") + ".</p>"
          + (got < cfg.n ? '<p class="warn">Các chương đã chọn chỉ có ' + got + " câu.</p>" : "") + '<ul class="plan-list">' + rows + "</ul>";
        go.disabled = false;
      }
      boxes.forEach(function (b) { b.addEventListener("change", paint); });
      main.querySelectorAll('input[name="che-do"]').forEach(function (r) { r.addEventListener("change", paint); });
      nIn.addEventListener("input", paint); tIn.addEventListener("input", paint);
      main.querySelectorAll(".chip").forEach(function (c) { c.addEventListener("click", function () { document.getElementById(c.parentNode.getAttribute("data-for")).value = c.getAttribute("data-v"); paint(); }); });
      document.getElementById("chon-het").onclick = function () { var all = [].every.call(boxes, function (b) { return b.checked; }); boxes.forEach(function (b) { b.checked = !all; }); paint(); };
      document.getElementById("ve-chuong").onclick = function () { chapters(ma); top(); };
      document.getElementById("bat-dau").onclick = function () {
        read(); if (!cfg.chs.length) return;
        function go() { store(examKey(d), null); startExam(d, { chs: cfg.chs, n: cfg.n, mode: cfg.mode, minutes: cfg.minutes }); }
        if (ex) modal({ title: "Bỏ bài thi đang làm dở?", body: "<p>Bắt đầu bài mới sẽ bỏ bài thi đang làm dở. Bài bỏ dở không ghi vào lịch sử.</p>", okText: "Bắt đầu bài mới", onOk: go });
        else go();
      };
      if (ex) {
        document.getElementById("thi-tiep").onclick = function () { quiz = { view: "quiz", mon: ma, khu: khuOf(m), s: sessionFrom(d, ex, "thi") }; renderQuiz(0); top(); };
        document.getElementById("thi-bo").onclick = function () {
          modal({ title: "Bỏ bài thi này?", body: "<p>Bài làm dở sẽ bị xóa và không ghi vào lịch sử.</p>", okText: "Bỏ bài", danger: true, onOk: function () { store(examKey(d), null); examSetup(ma); } });
        };
      }
      paint();
    }).catch(function (e) { render(errorBox(e), "err"); });
  }

  /* ---------- Đồng hồ: đếm thời gian làm bài, và đếm ngược khi thi thật ----------
     Chỉ chạy khi đang ở màn làm bài và tab đang mở; rời màn hình là dừng và lưu lại. */
  var clockId = null, clockSaved = 0;
  function addElapsed(s) {
    if (!s || !s.tickAt) return;
    var dt = Math.min(Date.now() - s.tickAt, 5000);
    s.ms = (s.ms || 0) + dt;
    if (s.mode === "that" && s.exam) s.exam.left = Math.max(0, s.exam.left - dt / 1000);
    s.tickAt = Date.now();
  }
  function startClock() {
    stopClock();
    var s = quiz.s; if (!s || s.finished) return;
    s.tickAt = document.visibilityState === "hidden" ? null : Date.now();
    clockId = setInterval(tick, 1000);
  }
  function tick() {
    var s = quiz.s;
    if (!s || s.finished || lastView !== "quiz") { pauseClock(); return; }
    if (document.visibilityState === "hidden") s.tickAt = null;
    else if (!s.tickAt) s.tickAt = Date.now();
    else addElapsed(s);
    if (s.mode === "that" && s.exam) {
      paintTimer();
      if (s.exam.left <= 0) { stopClock(); submitExam(true); return; }
    }
    if (Date.now() - clockSaved > 5000) { clockSaved = Date.now(); save(); }
  }
  function stopClock() { if (clockId) { clearInterval(clockId); clockId = null; } }
  function pauseClock() {
    if (!clockId) return;
    var s = quiz.s;
    if (s && !s.finished) { addElapsed(s); s.tickAt = null; save(); }
    stopClock();
  }
  document.addEventListener("visibilitychange", function () {
    var s = quiz.s; if (!s || !clockId) return;
    if (document.visibilityState === "hidden") { addElapsed(s); s.tickAt = null; save(); }
    else s.tickAt = Date.now();
  });
  window.addEventListener("pagehide", function () { pauseClock(); });
  function paintTimer() {
    var el = document.getElementById("timer"), s = quiz.s; if (!el || !s.exam) return;
    el.querySelector("b").textContent = clock(s.exam.left);
    el.classList.toggle("low", s.exam.left <= 300);
  }

  /* ---------- Màn làm bài ---------- */
  function isExam(s) { return s.mode === "that"; }
  function answered() { return quiz.s.items.filter(function (it) { return it.pick !== null; }).length; }
  function counterText() { var s = quiz.s; return "Câu " + (s.cur + 1) + "/" + s.items.length + (isExam(s) ? ", đã chọn " : ", đã làm ") + answered(); }
  function streakHTML() { var n = quiz.s.streak || 0; return '<span class="streak' + (n >= 2 ? " on" : "") + '" id="streak" aria-live="polite">Chuỗi đúng <b>' + n + "</b></span>"; }
  function timerHTML() { var s = quiz.s; return '<span class="timer' + (s.exam.left <= 300 ? " low" : "") + '" id="timer" role="timer"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg><b>' + clock(s.exam.left) + "</b></span>"; }
  function hopClass(x, i) {
    var c = "hop";
    if (x.pick !== null) c += isExam(quiz.s) ? " done" : (x.order[x.pick] === 0 ? " ok" : " bad");
    if (i === quiz.s.cur) c += " cur";
    if (x.q.kho) c += " hard";
    return c;
  }
  function explainHTML(it) {
    var q = it.q, ok = it.order[it.pick] === 0;
    return '<div class="explain ' + (ok ? "yes" : "no") + '" role="status"><span class="verdict">' + (ok ? "Chính xác!" : "Chưa đúng. Đáp án đúng là " + KEYS[it.order.indexOf(0)] + ".") + "</span>"
      + "<span>" + rich(q.giai_thich) + "</span>" + (q.nguon ? '<span class="source">Nguồn: ' + esc(q.nguon) + "</span>" : "") + "</div>";
  }
  function chapTag(s, it) {
    if (s.kind !== "thi") return "";
    var ch = findChapter(s.d, it.chId);
    return ch ? '<span class="tag ch">' + esc(chapLabel(ch, chapPos(s.d, ch)) + " · " + chapShort(ch)) + "</span>" : "";
  }

  /* dir: 1 = sang câu sau, -1 = về câu trước, 0 = mở lần đầu */
  function renderQuiz(dir) {
    var s = quiz.s, it = s.items[s.cur], q = it.q, total = s.items.length, ex = isExam(s), picked = it.pick !== null, locked = picked && !ex;
    quiz.view = "quiz";
    var h = '<div class="quiz-top"><button class="link-btn" id="ve-chuong">' + esc(s.d.mon) + ": các chương</button>"
      + '<button class="link-btn" id="nop-bai">Nộp bài</button></div>'
      + '<div class="quiz-head"><div class="stack"><h2>' + esc(s.title) + "</h2>"
      + '<div class="counter" id="counter">' + counterText() + "</div></div>" + (ex ? timerHTML() : streakHTML()) + "</div>"
      + '<div class="route" id="route"><div class="route-inner">';
    s.items.forEach(function (x, i) {
      h += '<button class="' + hopClass(x, i) + '" data-i="' + i + '" aria-label="Câu ' + (i + 1) + (x.q.kho ? ", câu khó" : "") + '"></button>';
    });
    h += '</div></div><article class="panel qcard' + (dir > 0 ? " from-next" : dir < 0 ? " from-prev" : "") + '" id="qcard">'
      + '<div class="qtags"><span class="qnum">Câu <b>' + (s.cur + 1) + "</b></span>" + (q.kho ? '<span class="tag">Khó</span>' : "") + chapTag(s, it)
      + heartBtn(s.d.ma_mon, q.id) + "</div>"
      + '<div class="qtext">' + qrich(q.hoi) + '</div><div class="opts">';
    it.order.forEach(function (dIdx, pos) {
      var c = "opt";
      if (locked) c += dIdx === 0 ? " right" : (pos === it.pick ? " wrong" : " dim");
      else if (ex && pos === it.pick) c += " chosen";
      h += '<button class="' + c + '" data-p="' + pos + '"' + (locked ? " disabled" : "") + (ex ? ' aria-pressed="' + (pos === it.pick) + '"' : "") + '><span class="key">' + KEYS[pos] + '</span><span class="txt">' + rich(q.dap_an[dIdx]) + "</span>"
        + (ex ? "" : (dIdx === 0 ? MARK_OK : MARK_BAD)) + "</button>";
    });
    var lastBtn = ex ? '<button class="btn primary" id="nop-cuoi">Nộp bài</button>' : '<button class="btn primary" id="xem-kq">Xem kết quả</button>';
    h += "</div>" + (locked ? explainHTML(it) : "") + "</article>"
      + '<div class="nav"><button class="btn" id="truoc"' + (s.cur === 0 ? " disabled" : "") + ">Câu trước</button>"
      + (s.cur === total - 1 ? lastBtn : '<button class="btn primary" id="sau">Câu sau</button>') + "</div>"
      + '<p class="hint">' + (ex ? "Thi thật: bấm đáp án khác để đổi. Đúng sai và điểm hiện sau khi nộp bài. " : "") + "Phím tắt: A, B, C, D (hoặc 1-4) để chọn; mũi tên trái, phải để chuyển câu.</p>";
    render(h, "quiz");
    // Khi xem lại câu đã làm thì không chạy lại hiệu ứng đúng/sai
    if (locked) main.querySelectorAll(".opt").forEach(function (o) { o.style.animation = "none"; o.querySelectorAll("path").forEach(function (p) { p.style.animation = "none"; p.style.strokeDashoffset = "0"; }); });
    if (locked) { var exb = main.querySelector(".explain"); if (exb) exb.style.animation = "none"; }
    document.getElementById("ve-chuong").onclick = function () { chapters(s.d.ma_mon); top(); };
    document.getElementById("nop-bai").onclick = ex ? confirmSubmit : results;
    document.getElementById("truoc").onclick = function () { go(-1); };
    var b = document.getElementById("sau"); if (b) b.onclick = function () { go(1); };
    b = document.getElementById("xem-kq"); if (b) b.onclick = results;
    b = document.getElementById("nop-cuoi"); if (b) b.onclick = confirmSubmit;
    main.querySelectorAll(".opt").forEach(function (o) { o.addEventListener("click", function () { choose(+o.getAttribute("data-p")); }); });
    main.querySelectorAll(".hop").forEach(function (o) {
      o.addEventListener("click", function () { var i = +o.getAttribute("data-i"); if (i === s.cur) return; var d = i > s.cur ? 1 : -1; s.cur = i; save(); renderQuiz(d); });
    });
    wireHearts(main);
    centerHop(false);
    if (!clockId) startClock();
  }
  function centerHop(smooth) {
    var cur = main.querySelector(".hop.cur"), r = document.getElementById("route");
    if (!cur || !r) return;
    var x = cur.offsetLeft - r.clientWidth / 2 + 10;
    if (smooth && !REDUCED && r.scrollTo) r.scrollTo({ left: x, behavior: "smooth" }); else r.scrollLeft = x;
  }

  /* Chọn đáp án: cập nhật ngay trên trang (không vẽ lại) để hiệu ứng chạy mượt. */
  function choose(pos) {
    var s = quiz.s, it = s.items[s.cur];
    if (!main.querySelector(".qcard")) return;
    if (isExam(s)) {
      /* Thi thật: chỉ ghi lựa chọn, đổi được, chưa cho biết đúng sai */
      it.pick = pos; save();
      main.querySelectorAll(".opt").forEach(function (o) { var on = +o.getAttribute("data-p") === pos; o.classList.toggle("chosen", on); o.setAttribute("aria-pressed", on); });
      var hp = main.querySelector('.hop[data-i="' + s.cur + '"]'); if (hp) hp.className = hopClass(it, s.cur);
      document.getElementById("counter").textContent = counterText();
      return;
    }
    if (it.pick !== null) return;
    it.pick = pos;
    var ok = it.order[pos] === 0;
    s.streak = ok ? (s.streak || 0) + 1 : 0;
    recordAnswer(s.d.ma_mon, it.q.id, ok);
    save();
    main.querySelectorAll(".opt").forEach(function (o) {
      var p = +o.getAttribute("data-p");
      o.disabled = true;
      if (it.order[p] === 0) o.classList.add("right");
      else if (p === pos) o.classList.add("wrong");
      else o.classList.add("dim");
    });
    main.querySelector(".opts").insertAdjacentHTML("afterend", explainHTML(it));
    var hop = main.querySelector('.hop[data-i="' + s.cur + '"]');
    if (hop) { hop.className = hopClass(it, s.cur) + " pop"; }
    document.getElementById("counter").textContent = counterText();
    var st = document.getElementById("streak");
    st.querySelector("b").textContent = s.streak;
    st.classList.toggle("on", s.streak >= 2);
    if (s.streak >= 2) { st.classList.remove("bump"); void st.offsetWidth; st.classList.add("bump"); }
    var ex = main.querySelector(".explain");
    setTimeout(function () {
      if (ex && ex.getBoundingClientRect().bottom > window.innerHeight) ex.scrollIntoView({ block: "nearest", behavior: REDUCED ? "auto" : "smooth" });
    }, 120);
  }
  function go(d) {
    var s = quiz.s, n = s.cur + d;
    if (n < 0 || n >= s.items.length) return;
    s.cur = n; save(); renderQuiz(d);
    var hd = main.querySelector(".quiz-head"); if (hd && hd.getBoundingClientRect().top < 70) hd.scrollIntoView({ block: "center" });
  }

  function confirmSubmit() {
    var s = quiz.s, blank = s.items.length - answered();
    modal({ title: "Nộp bài?", body: blank ? "<p>Còn <b>" + blank + "</b> câu chưa chọn. Câu bỏ trống tính là sai.</p>" : "<p>Bạn đã chọn đủ " + s.items.length + " câu.</p>",
      okText: "Nộp bài", cancelText: "Làm tiếp", onOk: function () { submitExam(false); } });
  }
  /* Nộp bài thi thật: tính điểm, đếm câu sai (bỏ trống cũng là sai), ghi lịch sử. */
  function submitExam(timeUp) {
    var s = quiz.s; if (!s || s.finished) return;
    pauseClock();
    var right = 0;
    s.items.forEach(function (it) { var ok = it.pick !== null && it.order[it.pick] === 0; if (ok) right++; recordAnswer(s.d.ma_mon, it.q.id, ok); });
    logHistory(s, right, s.items.length);
    s.finished = true; s.timeUp = timeUp;
    store(s.key, null);
    results();
  }

  function scoreMsg(p) {
    if (p >= 90) return "Rất tốt, gần như đã thuộc phần này.";
    if (p >= 70) return "Khá chắc rồi. Xem lại vài câu sai là ổn.";
    if (p >= 50) return "Nắm được hơn nửa. Nên làm lại các câu sai.";
    return "Nên đọc lại bản tóm tắt rồi làm lại.";
  }
  function countUp(el, to) {
    if (REDUCED || to === 0) { el.textContent = to; return; }
    var t0 = null, dur = 800;
    function step(t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }

  function results() {
    var s = quiz.s;
    pauseClock();
    quiz.view = "ketqua";
    var ex = isExam(s), total = s.items.length;
    var right = s.items.filter(function (it) { return it.pick !== null && it.order[it.pick] === 0; });
    var wrong = s.items.filter(function (it) { return it.pick !== null && it.order[it.pick] !== 0; });
    var skip = s.items.filter(function (it) { return it.pick === null; });
    var pr = total ? right.length * 100 / total : 0, pw = total ? (ex ? wrong.length + skip.length : wrong.length) * 100 / total : 0;
    if (!ex && !skip.length && !s.finished) {
      /* Luyện tập làm đủ câu = đã xong: ghi lịch sử, xóa tiến độ */
      logHistory(s, right.length, total);
      s.finished = true;
      store(s.key, null);
      if (s.kind === "chuong" && !s.retry) store("diem:" + s.d.ma_mon + ":" + s.ch.id, { dung: right.length, tong: total });
    }
    var redo = ex ? wrong.concat(skip) : wrong, review = wrong.concat(skip);
    var trail = s.items.map(function (it, i) {
      var c = it.pick === null ? (ex ? "bad" : "") : (it.order[it.pick] === 0 ? "ok" : "bad");
      return '<i class="' + c + '" title="Câu ' + (i + 1) + '" style="animation-delay:' + Math.min(i * 15, 900) + 'ms"></i>';
    }).join("");
    var h = '<div class="quiz-top"><button class="link-btn" id="ve-chuong">' + esc(s.d.mon) + ": các chương</button></div>"
      + '<section class="panel score"><h2>' + esc(s.title) + "</h2>"
      + (s.timeUp ? '<p class="warn">Hết giờ, bài đã được nộp tự động.</p>' : "")
      + '<div class="score-num"><b id="so-dung">0</b><span> / ' + total + " câu đúng (" + Math.round(pr) + "%)</span></div>"
      + '<p class="score-msg">' + scoreMsg(pr) + "</p>"
      + '<div class="bar" aria-hidden="true"><i id="bar-ok"></i><i id="bar-bad"></i></div>'
      + '<div class="stats"><span class="ans-ok">Đúng: ' + right.length + "</span>"
      + (ex ? '<span class="ans-bad">Sai: ' + (wrong.length + skip.length) + (skip.length ? " (bỏ trống " + skip.length + ")" : "") + "</span>"
            : '<span class="ans-bad">Sai: ' + wrong.length + '</span><span class="muted">Chưa làm: ' + skip.length + "</span>")
      + (s.finished && s.ms ? '<span class="muted">Thời gian: ' + duration(s.ms / 1000) + "</span>" : "") + "</div>"
      + '<div class="trail" aria-label="Kết quả từng câu">' + trail + "</div>";
    if (s.kind === "thi") {
      var by = {};
      s.items.forEach(function (it) { var b = by[it.chId] || (by[it.chId] = { d: 0, t: 0 }); b.t++; if (it.pick !== null && it.order[it.pick] === 0) b.d++; });
      h += '<div class="stack"><b class="small">Theo chương</b><ul class="by-chap">' + s.d.chuong.filter(function (c) { return by[c.id]; }).map(function (c) {
        var b = by[c.id];
        return '<li><span class="badge sm">' + esc(chapLabel(c, chapPos(s.d, c))) + '</span><span class="by-name">' + esc(chapShort(c)) + '</span><span class="by-score">' + b.d + "/" + b.t + '</span><span class="meter"><i style="width:' + (b.d * 100 / b.t) + '%"></i></span></li>';
      }).join("") + "</ul></div>";
    }
    h += '<div class="row-actions">'
      + (redo.length ? '<button class="btn primary" id="lai-sai">Làm lại ' + redo.length + " câu sai</button>" : "")
      + (!ex && skip.length ? '<button class="btn' + (redo.length ? "" : " primary") + '" id="lam-tiep">Làm tiếp ' + skip.length + " câu chưa làm</button>" : "")
      + (s.kind === "thi" ? '<button class="btn" id="thi-lai">Thi lại đề mới</button>' : '<button class="btn" id="lai-het">Làm lại cả chương</button>') + "</div></section>";
    if (review.length) {
      h += '<section class="stack"><h2>Cần xem lại</h2><div class="review">';
      review.forEach(function (it) {
        var q = it.q, sk = it.pick === null;
        h += '<div class="panel review-item' + (sk && !ex ? " skip" : "") + '"><div class="review-top"><div class="review-q">' + qrich(q.hoi) + "</div>" + heartBtn(s.d.ma_mon, q.id) + "</div>"
          + (sk ? '<div class="small ' + (ex ? "ans-bad" : "muted") + '">' + (ex ? "Bỏ trống (tính là sai)" : "Chưa làm") + "</div>" : '<div class="small ans-bad">Bạn chọn: ' + rich(q.dap_an[it.order[it.pick]]) + "</div>")
          + '<div class="small ans-ok">Đáp án đúng: ' + rich(q.dap_an[0]) + '</div><div class="small">' + rich(q.giai_thich) + "</div></div>";
      });
      h += "</div></section>";
    }
    render(h, "ketqua"); top();
    wireHearts(main);
    countUp(document.getElementById("so-dung"), right.length);
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      document.getElementById("bar-ok").style.width = pr + "%";
      document.getElementById("bar-bad").style.width = pw + "%";
    }); });
    document.getElementById("ve-chuong").onclick = function () { chapters(s.d.ma_mon); top(); };
    var b = document.getElementById("lai-het"); if (b) b.onclick = function () { start(s.d, s.ch); top(); };
    b = document.getElementById("thi-lai");
    if (b) b.onclick = function () { var c = load("thi-cai-dat:" + s.d.ma_mon); if (c) startExam(s.d, c); else examSetup(s.d.ma_mon); };
    b = document.getElementById("lai-sai");
    if (b) b.onclick = function () {
      if (s.kind === "thi") startRetryList(s.d, redo, s);
      else { start(s.d, s.ch, redo.map(function (it) { return it.q.id; })); top(); }
    };
    b = document.getElementById("lam-tiep");
    if (b) b.onclick = function () { quiz.view = "quiz"; s.cur = s.items.indexOf(skip[0]); save(); renderQuiz(0); top(); };
  }

  /* ================= TÀI LIỆU ================= */
  var docsMon = null;
  function docs() {
    render('<p class="loading">Đang tải...</p>', "loading");
    getRegistry().then(function (reg) {
      if (docsMon && findSubject(docsMon)) return docsSubject(docsMon);
      var h = '<div class="stack"><h1>Tài liệu môn học</h1><p class="muted">Bản tóm tắt PDF tự làm. Chọn môn để xem tài liệu của môn đó.</p></div>';
      ["hien-tai", "tong"].forEach(function (k, ki) {
        var list = reg.mon.filter(function (m) { return khuOf(m) === k; });
        if (!list.length) return;
        h += '<section class="stack"><div class="section-title" style="--c:' + wire(ki * 2) + '">' + (k === "tong" ? "Môn học khác" : "Môn học kỳ này") + '</div><div class="panel list">';
        list.forEach(function (m, i) {
          var n = (m.tai_lieu || []).length;
          h += '<button class="item" style="--c:' + wire(i) + '" data-mon="' + esc(m.ma_mon) + '"' + (n ? "" : " disabled") + ">" + subjectBadge(m)
            + '<span class="item-body"><span class="item-name">' + esc(m.ten) + '</span><span class="item-meta">' + (n ? n + " tài liệu" : "Chưa có tài liệu") + "</span></span>"
            + (n ? '<span class="item-go">Xem</span>' : "") + "</button>";
        });
        h += "</div></section>";
      });
      render(h, "tai-lieu");
      main.querySelectorAll(".item[data-mon]").forEach(function (b) { b.addEventListener("click", function () { docsSubject(b.getAttribute("data-mon")); top(); }); });
    }).catch(function (e) { render(errorBox(e), "err"); });
  }
  function docsSubject(ma) {
    var m = findSubject(ma); docsMon = ma;
    var p = m.file_cau_hoi ? getSubject(m).catch(function () { return null; }) : Promise.resolve(null);
    p.then(function (d) {
      var list = m.tai_lieu || [];
      var h = '<div class="crumbs"><button class="link-btn" id="ve-tl">Tài liệu</button><span>/</span><span>' + esc(m.ten) + "</span></div>"
        + '<div class="stack"><h1>' + esc(m.ten) + '</h1><p class="muted">' + list.length + ' tài liệu tóm tắt. Bấm để mở trong tab mới.</p></div><div class="panel list">';
      list.forEach(function (t, i) {
        var ch = d && t.chuong ? findChapter(d, t.chuong) : null;
        h += '<a class="item" style="--c:' + wire(i) + '" href="' + esc(t.file) + '" target="_blank" rel="noopener">'
          + (ch ? '<span class="badge">' + esc(chapLabel(ch, chapPos(d, ch))) + "</span>" : '<span class="doc-icon" aria-hidden="true">PDF</span>')
          + '<span class="item-body"><span class="item-name">' + esc(t.ten) + "</span>" + (t.loai ? '<span class="doc-type">' + esc(t.loai) + " · PDF</span>" : "") + "</span>"
          + '<span class="item-go">Mở</span></a>';
      });
      h += "</div>";
      render(h, "tai-lieu:" + ma);
      document.getElementById("ve-tl").onclick = function () { docsMon = null; docs(); top(); };
    });
  }

  /* ================= SỔ ÔN TẬP ================= */
  var nbTab = "luu";
  function notebook(keepTab) {
    if (!keepTab) nbTab = "luu";                      /* mở trang là vào phần Đã lưu */
    if (lastView !== "so-on-tap") render('<p class="loading">Đang tải...</p>', "loading");
    getRegistry().then(function (reg) {
      var saved = savedAll(), stats = statsAll();
      var codes = reg.mon.filter(function (m) { return m.file_cau_hoi && (saved[m.ma_mon] || stats[m.ma_mon]); });
      return Promise.all(codes.map(function (m) { return getSubject(m).catch(function () { return null; }); })).then(function (ds) {
        var data = [], nLuu = 0, nSai = 0;
        codes.forEach(function (m, i) {
          var d = ds[i]; if (!d) return;
          var chs = [];
          d.chuong.forEach(function (ch) {
            var luu = [], sai = [];
            ch.cau.forEach(function (q) {
              if (saved[m.ma_mon] && saved[m.ma_mon][q.id]) luu.push(q);
              var r = stats[m.ma_mon] && stats[m.ma_mon][q.id]; if (r && r.sai >= 2) sai.push({ q: q, n: r.sai });
            });
            sai.sort(function (a, b) { return b.n - a.n; });
            nLuu += luu.length; nSai += sai.length;
            if (luu.length || sai.length) chs.push({ ch: ch, luu: luu, sai: sai });
          });
          if (chs.length) data.push({ m: m, d: d, chs: chs });
        });
        drawNotebook(data, nLuu, nSai);
      });
    }).catch(function (e) { render(errorBox(e), "err"); });
  }
  function drawNotebook(data, nLuu, nSai) {
    var isLuu = nbTab === "luu", count = isLuu ? nLuu : nSai, y = window.scrollY;
    var h = '<div class="stack"><h1>Sổ ôn tập</h1><p class="muted">Câu bạn đã lưu và câu hay sai, để đọc lại. Chỉ lưu trên trình duyệt của máy này.</p></div>'
      + '<div class="nb-bar"><div class="seg" role="tablist" aria-label="Phần của Sổ ôn tập">'
      + '<button role="tab" class="seg-btn' + (isLuu ? " on" : "") + '" aria-selected="' + isLuu + '" data-tab="luu"><span class="seg-heart">' + HEART + "</span>Đã lưu <b>" + nLuu + "</b></button>"
      + '<button role="tab" class="seg-btn' + (!isLuu ? " on" : "") + '" aria-selected="' + !isLuu + '" data-tab="sai">Hay sai <b>' + nSai + "</b></button></div>"
      + (nLuu + nSai ? '<button class="link-btn danger" id="xoa-het">Xóa toàn bộ</button>' : "") + "</div>"
      + '<p class="small muted nb-note">' + (isLuu ? "Bấm trái tim trên câu hỏi khi làm bài để lưu câu vào đây. Bấm lại trái tim để bỏ lưu."
        : "Câu sai từ 2 lần trở lên, nhiều lần sai nhất lên trước. Làm đúng câu đó 2 lần liên tiếp thì câu tự rời danh sách.") + "</p>";
    if (!count) {
      h += '<div class="panel empty"><p><b>' + (isLuu ? "Chưa có câu nào được lưu." : "Chưa có câu hay sai.") + '</b></p><p class="muted">'
        + (isLuu ? "Khi làm bài, bấm hình trái tim ở góc câu hỏi để lưu câu cần nhớ." : "Câu nào bạn trả lời sai từ 2 lần trở lên sẽ hiện ở đây.") + '</p><a class="btn" href="#trac-nghiem">Làm trắc nghiệm</a></div>';
    }
    data.forEach(function (g, gi) {
      var chs = g.chs.filter(function (c) { return (isLuu ? c.luu : c.sai).length; });
      if (!chs.length) return;
      h += '<section class="nb-mon" style="--c:' + wire(gi) + '"><div class="nb-head nb-head-mon"><h2>' + esc(g.m.ten) + '</h2><button class="link-btn danger" data-xoa-mon="' + esc(g.m.ma_mon) + '">Xóa môn</button></div>';
      chs.forEach(function (c) {
        h += '<div class="nb-ch"><div class="nb-head"><h3><span class="badge sm">' + esc(chapLabel(c.ch, chapPos(g.d, c.ch))) + "</span>" + esc(chapShort(c.ch)) + "</h3>"
          + '<button class="link-btn danger" data-xoa-ch="' + esc(g.m.ma_mon) + "|" + esc(c.ch.id) + '">Xóa chương</button></div><div class="nb-list">';
        (isLuu ? c.luu.map(function (q) { return { q: q, n: wrongCount(g.m.ma_mon, q.id) }; }) : c.sai).forEach(function (x) {
          var q = x.q, key = esc(g.m.ma_mon) + "|" + esc(q.id);
          h += '<article class="panel nb-item"><div class="nb-tags">'
            + (x.n >= 2 ? '<span class="tag bad">Sai ' + x.n + " lần</span>" : "") + (q.kho ? '<span class="tag">Khó</span>' : "")
            + '<span class="nb-actions">' + heartBtn(g.m.ma_mon, q.id)
            + (!isLuu ? '<button class="icon-btn" data-bo-sai="' + key + '" title="Bỏ khỏi danh sách hay sai" aria-label="Bỏ khỏi danh sách hay sai"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg></button>' : "")
            + "</span></div>"
            + '<div class="nb-q">' + qrich(q.hoi) + "</div>"
            + '<div class="nb-ans"><span class="nb-lbl">Đáp án</span><span class="nb-ans-txt">' + rich(q.dap_an[0]) + "</span></div>"
            + '<button class="link-btn nb-toggle" aria-expanded="false">Xem giải thích</button>'
            + '<div class="nb-gt" hidden><span>' + rich(q.giai_thich) + "</span>" + (q.nguon ? '<span class="source">Nguồn: ' + esc(q.nguon) + "</span>" : "") + "</div></article>";
        });
        h += "</div></div>";
      });
      h += "</section>";
    });
    var same = lastView === "so-on-tap";
    render(h, "so-on-tap");
    if (same) window.scrollTo(0, y);
    main.querySelectorAll(".seg-btn").forEach(function (b) { b.addEventListener("click", function () { nbTab = b.getAttribute("data-tab"); notebook(true); }); });
    main.querySelectorAll(".nb-toggle").forEach(function (b) {
      b.addEventListener("click", function () { var gt = b.nextElementSibling, open = gt.hidden; gt.hidden = !open; b.setAttribute("aria-expanded", open); b.textContent = open ? "Ẩn giải thích" : "Xem giải thích"; });
    });
    wireHearts(main, function (ma, id, on) {
      if (isLuu && !on) { notebook(true); toast("Đã bỏ lưu 1 câu.", function () { setSaved(ma, id, true); notebook(true); }); }
      else { toast(on ? "Đã lưu vào Sổ ôn tập." : "Đã bỏ lưu câu này."); }
    });
    main.querySelectorAll("[data-bo-sai]").forEach(function (b) {
      b.addEventListener("click", function () {
        var p = b.getAttribute("data-bo-sai").split("|"), a = statsAll(), old = a[p[0]] && a[p[0]][p[1]];
        if (!old) return;
        delete a[p[0]][p[1]]; if (!Object.keys(a[p[0]]).length) delete a[p[0]]; store("so-on-tap:sai", a);
        notebook(true);
        toast("Đã bỏ 1 câu khỏi danh sách hay sai.", function () { var x = statsAll(); x[p[0]] = x[p[0]] || {}; x[p[0]][p[1]] = old; store("so-on-tap:sai", x); notebook(true); });
      });
    });
    /* Xóa theo chương, môn, toàn bộ: xóa cả phần Đã lưu và Hay sai trong phạm vi đó. */
    function wipe(filter) {
      ["so-on-tap:luu", "so-on-tap:sai"].forEach(function (k) {
        var a = load(k) || {};
        Object.keys(a).forEach(function (ma) { Object.keys(a[ma]).forEach(function (id) { if (filter(ma, id)) delete a[ma][id]; }); if (!Object.keys(a[ma]).length) delete a[ma]; });
        store(k, a);
      });
      notebook(true);
    }
    var BOTH = "<p>Xóa cả câu <b>đã lưu</b> và dữ liệu <b>hay sai</b> của ";
    main.querySelectorAll("[data-xoa-ch]").forEach(function (b) {
      b.addEventListener("click", function () {
        var p = b.getAttribute("data-xoa-ch").split("|"), ch = findChapter(subjects[p[0]], p[1]), ids = {};
        ch.cau.forEach(function (q) { ids[q.id] = 1; });
        modal({ title: "Xóa chương khỏi Sổ ôn tập?", body: BOTH + "chương “" + esc(ch.ten) + "”. Không hoàn tác được.</p>", okText: "Xóa chương", wait: 3, danger: true,
          onOk: function () { wipe(function (ma, id) { return ma === p[0] && ids[id]; }); toast("Đã xóa chương khỏi Sổ ôn tập."); } });
      });
    });
    main.querySelectorAll("[data-xoa-mon]").forEach(function (b) {
      b.addEventListener("click", function () {
        var ma = b.getAttribute("data-xoa-mon");
        modal({ title: "Xóa môn khỏi Sổ ôn tập?", body: BOTH + "môn “" + esc(findSubject(ma).ten) + "”. Không hoàn tác được.</p>", okText: "Xóa môn", wait: 3, danger: true,
          onOk: function () { wipe(function (m) { return m === ma; }); toast("Đã xóa môn khỏi Sổ ôn tập."); } });
      });
    });
    var all = document.getElementById("xoa-het");
    if (all) all.onclick = function () {
      modal({ title: "Xóa toàn bộ Sổ ôn tập?", body: "<p>Xóa <b>tất cả</b> câu đã lưu và dữ liệu hay sai của mọi môn. Không hoàn tác được.</p>", okText: "Xóa toàn bộ", wait: 3, danger: true,
        onOk: function () { store("so-on-tap:luu", null); store("so-on-tap:sai", null); notebook(true); toast("Đã xóa toàn bộ Sổ ôn tập."); } });
    };
  }

  /* ================= LỊCH SỬ ================= */
  function historyView() {
    render('<p class="loading">Đang tải...</p>', "loading");
    getRegistry().then(function () {
      var list = load("lich-su") || [];
      var h = '<div class="stack"><h1>Lịch sử làm bài</h1><p class="muted">Các lần làm bài đã xong trên máy này (giữ ' + HISTORY_MAX + " lần gần nhất). Bài bỏ dở không được ghi.</p></div>";
      if (!list.length) h += '<div class="panel empty"><p><b>Chưa có lần làm bài nào.</b></p><p class="muted">Làm xong một chương hoặc một bài thi thử thì kết quả sẽ hiện ở đây.</p><a class="btn" href="#trac-nghiem">Làm trắc nghiệm</a></div>';
      var day = "", today = new Date(), yest = new Date(Date.now() - 864e5);
      function dayName(d) {
        var s = pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
        if (d.toDateString() === today.toDateString()) return "Hôm nay, " + s;
        if (d.toDateString() === yest.toDateString()) return "Hôm qua, " + s;
        return ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"][d.getDay()] + ", " + s;
      }
      list.forEach(function (r) {
        var d = new Date(r.t), dn = dayName(d);
        if (dn !== day) { if (day) h += "</div></section>"; day = dn; h += '<section class="stack"><div class="section-title">' + esc(dn) + '</div><div class="panel list">'; }
        var p = r.tong ? Math.round(r.dung * 100 / r.tong) : 0, lv = p >= 80 ? "ok" : p >= 50 ? "mid" : "bad";
        h += '<div class="item hist"><span class="hist-time">' + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + "</span>"
          + '<span class="item-body"><span class="item-name">' + esc(r.mon) + '</span><span class="item-meta">' + esc(r.ten) + "</span>"
          + '<span class="item-meta"><span class="mode-pill m-' + esc(r.che_do) + '">' + esc(MODE_NAME[r.che_do] || r.che_do) + "</span>" + (r.giay ? " · " + duration(r.giay) : "") + "</span></span>"
          + '<span class="hist-score"><b>' + r.dung + "/" + r.tong + '</b><span class="pct ' + lv + '">' + p + "%</span></span></div>";
      });
      if (day) h += "</div></section>";
      render(h, "lich-su");
    }).catch(function (e) { render(errorBox(e), "err"); });
  }

  /* ---------- Phím tắt khi làm bài ---------- */
  document.addEventListener("keydown", function (e) {
    if (!quiz.s || quiz.view !== "quiz" || !main.querySelector(".qcard") || e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".modal-wrap")) return;
    var t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    var map = { A: 0, B: 1, C: 2, D: 3, "1": 0, "2": 1, "3": 2, "4": 3 }, k = e.key.toUpperCase();
    if (k in map) { choose(map[k]); e.preventDefault(); }
    else if (e.key === "ArrowRight") { go(1); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { go(-1); e.preventDefault(); }
  });

  /* ---------- Sáng / tối ----------
     Lần đầu theo cài đặt của máy. Bấm nút thì chọn hẳn sáng hoặc tối và nhớ lựa chọn trên máy này. */
  var mqDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function currentTheme() { var t = document.documentElement.getAttribute("data-theme"); return t || (mqDark && mqDark.matches ? "dark" : "light"); }
  function paintThemeButtons() {
    var dark = currentTheme() === "dark";
    document.querySelectorAll("[data-theme-btn]").forEach(function (b) {
      b.setAttribute("aria-pressed", dark);
      b.title = dark ? "Chuyển sang nền sáng" : "Chuyển sang nền tối";
      var l = b.querySelector(".theme-label"); if (l) l.textContent = dark ? "Nền tối" : "Nền sáng";
    });
  }
  var savedTheme = load("giao-dien");
  if (savedTheme === "dark" || savedTheme === "light") document.documentElement.setAttribute("data-theme", savedTheme);
  document.querySelectorAll("[data-theme-btn]").forEach(function (b) {
    b.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      store("giao-dien", next);
      paintThemeButtons();
    });
  });
  if (mqDark && mqDark.addEventListener) mqDark.addEventListener("change", paintThemeButtons);
  paintThemeButtons();

  /* ---------- Ngăn kéo menu bên trái (điện thoại, khi đang làm bài) ---------- */
  var drawer = document.getElementById("ngan-keo");
  function openDrawer() {
    if (!drawer) return;
    drawer.hidden = false; void drawer.offsetWidth; drawer.classList.add("open");
    var f = drawer.querySelector(".dtab[aria-current]") || drawer.querySelector(".dtab"); if (f) f.focus();
  }
  function closeDrawer() {
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove("open");
    setTimeout(function () { if (!drawer.classList.contains("open")) drawer.hidden = true; }, REDUCED ? 0 : 220);
  }
  if (drawer) {
    document.getElementById("mo-menu").addEventListener("click", openDrawer);
    drawer.addEventListener("click", function (e) { if (e.target === drawer || e.target.closest(".dtab") || e.target.closest("[data-close]")) closeDrawer(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });
  }

  setTimeout(route, 0);
})();
