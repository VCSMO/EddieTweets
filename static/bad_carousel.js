(() => {
  const state = {
    slides: [],
    overrides: {
      divider_y: 50,
      hook_font_size: 111,
      body_font_size: 75,
      lesson_title_size: 150,
      edge_fade: 30,
    },
  };

  const SLIDE_W = 1080;
  const SLIDE_H = 1440;

  const uid = () => Math.random().toString(36).slice(2, 10);

  const loadState = () => {
    try {
      const saved = localStorage.getItem("bad_carousel_state");
      if (saved) {
        const obj = JSON.parse(saved);
        state.slides = (obj.slides || []).map(s => ({
          positionX: 50,
          positionY: 50,
          translateX: 0,
          translateY: 0,
          scale: 1,
          ...s,
          media: null,
        }));
        state.overrides = { ...state.overrides, ...(obj.overrides || {}) };
      }
    } catch (e) {}
    if (state.slides.length === 0) {
      state.slides = [
        { id: uid(), type: "hook", text: "When is the last time a billboard *made you hungry*?", media: null, positionX: 50, positionY: 50, translateX: 0, translateY: 0, scale: 1 },
      ];
    }
  };

  const saveState = () => {
    try {
      localStorage.setItem("bad_carousel_state", JSON.stringify({
        slides: state.slides.map(({ media, ...rest }) => rest),
        overrides: state.overrides,
      }));
    } catch (e) {}
  };

  // Parse *bold* and <b>bold</b> into <span class="emphasis">
  // Every newline starts a new <div class="para"> (matches the JSX's
  // 18pt leading on first char after \r behavior). Blank lines produce
  // empty paragraphs → extra spacing.
  const parseCopy = (raw) => {
    const lines = raw.replace(/\r\n/g, "\n").split("\n");
    return lines.map(line => {
      let text = line.trim();
      if (!text) return "";
      text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      text = text.replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>");
      text = text.replace(/<b>([^<]+)<\/b>/g, '<span class="emphasis">$1</span>');
      text = text.replace(/\*([^*]+)\*/g, '<span class="emphasis">$1</span>');
      return `<div class="para">${text}</div>`;
    }).filter(Boolean).join("");
  };

  // ==== Session management (named snapshots) ====
  const SESSIONS_KEY = "bad_carousel_sessions";

  const loadSessions = () => {
    try {
      return JSON.parse(localStorage.getItem(SESSIONS_KEY) || "{}");
    } catch (e) { return {}; }
  };

  const writeSessions = (sessions) => {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)); } catch (e) {}
  };

  const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const formatDate = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    } catch (e) { return ""; }
  };

  const saveAsNewSession = () => {
    const name = prompt("Name this session:", "Carousel " + new Date().toLocaleDateString());
    if (!name) return;
    const sessions = loadSessions();
    const id = "s_" + uid();
    sessions[id] = {
      id,
      name: name.trim() || "Untitled",
      slides: state.slides.map(({ media, ...rest }) => rest),
      overrides: state.overrides,
      updatedAt: new Date().toISOString(),
    };
    writeSessions(sessions);
    renderSessionList();
  };

  const loadSessionById = (id) => {
    const sessions = loadSessions();
    const session = sessions[id];
    if (!session) return;
    // Revoke any existing media blob URLs before replacing state
    state.slides.forEach(s => { if (s.media?.url) URL.revokeObjectURL(s.media.url); });
    state.slides = (session.slides || []).map(s => ({
      positionX: 50,
      positionY: 50,
      ...s,
      media: null,
    }));
    state.overrides = { ...state.overrides, ...(session.overrides || {}) };
    saveState();
    rebuildAll();
    // Sync advanced inputs
    advancedFields.forEach(field => {
      const input = document.getElementById(field);
      if (input && state.overrides[field] !== undefined) input.value = state.overrides[field];
    });
    toggleSessionDropdown(false);
  };

  const deleteSessionById = (id) => {
    if (!confirm("Delete this session? This can't be undone.")) return;
    const sessions = loadSessions();
    delete sessions[id];
    writeSessions(sessions);
    renderSessionList();
  };

  const newCarousel = () => {
    const hasContent = state.slides.some(s => (s.text || "").trim() || s.media);
    if (hasContent && !confirm("Start a new carousel? Save your current work first if you want to keep it.")) return;
    state.slides.forEach(s => { if (s.media?.url) URL.revokeObjectURL(s.media.url); });
    state.slides = [
      { id: uid(), type: "hook", text: "When is the last time a billboard *made you hungry*?", media: null, positionX: 50, positionY: 50 },
    ];
    saveState();
    rebuildAll();
    toggleSessionDropdown(false);
  };

  const renderSessionList = () => {
    const list = document.getElementById("sessionList");
    if (!list) return;
    const sessions = loadSessions();
    const entries = Object.values(sessions).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    if (entries.length === 0) {
      list.innerHTML = '<div class="session-empty">No saved sessions yet</div>';
      return;
    }
    list.innerHTML = entries.map(s => `
      <div class="session-item" data-id="${s.id}">
        <button class="session-load" title="Load">
          <div>${escapeHtml(s.name)}</div>
          <div class="session-meta">${escapeHtml(formatDate(s.updatedAt))} · ${s.slides?.length ?? 0} slides</div>
        </button>
        <button class="session-delete" title="Delete">✕</button>
      </div>
    `).join("");
    list.querySelectorAll(".session-item").forEach(item => {
      const id = item.dataset.id;
      item.querySelector(".session-load").addEventListener("click", () => loadSessionById(id));
      item.querySelector(".session-delete").addEventListener("click", (e) => {
        e.stopPropagation();
        deleteSessionById(id);
      });
    });
  };

  const toggleSessionDropdown = (show) => {
    const dropdown = document.getElementById("sessionDropdown");
    if (!dropdown) return;
    const shouldShow = show !== undefined ? show : dropdown.hidden;
    dropdown.hidden = !shouldShow;
    if (shouldShow) renderSessionList();
  };

  const setupSessionMenu = () => {
    document.getElementById("sessionBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSessionDropdown();
    });
    document.getElementById("newSession").addEventListener("click", newCarousel);
    document.getElementById("saveSessionBtn").addEventListener("click", saveAsNewSession);
    document.addEventListener("click", (e) => {
      const menu = document.querySelector(".session-menu");
      if (menu && !menu.contains(e.target)) toggleSessionDropdown(false);
    });
  };

  // ==== Script parser (TEXT DOC.txt style) ====
  const SCRIPT_LABELS = {
    "HOOK SLIDE": "hook",
    "TEXT ON TOP": "top",
    "TEXT ON BOTTOM": "bottom",
    "THE LESSON": "lesson",
    "[AFTER EFFECTS — VIDEO]": "video",
    // Also accept ASCII em-dash in case the user's file uses a hyphen
    "[AFTER EFFECTS - VIDEO]": "video",
    "[AFTER EFFECTS -- VIDEO]": "video",
    "CTA": "cta",
  };

  const parseScript = (text) => {
    const rawLines = text.replace(/\r\n/g, "\n").split("\n");
    const slides = [];
    let curLabel = null;
    let curLines = [];

    const flush = () => {
      if (curLabel === null) return;
      const type = SCRIPT_LABELS[curLabel];
      if (!type) return;
      // Trim leading/trailing blank lines from the content
      while (curLines.length && !curLines[0].trim()) curLines.shift();
      while (curLines.length && !curLines[curLines.length - 1].trim()) curLines.pop();
      slides.push({
        id: uid(),
        type,
        text: curLines.join("\n"),
        media: null,
        positionX: 50,
        positionY: 50,
      });
    };

    for (const line of rawLines) {
      const trimmed = line.trim();
      if (SCRIPT_LABELS[trimmed] !== undefined) {
        flush();
        curLabel = trimmed;
        curLines = [];
      } else if (curLabel !== null) {
        curLines.push(line);
      }
    }
    flush();

    return slides;
  };

  const loadScript = async (file) => {
    let text;
    try {
      text = await file.text();
    } catch (e) {
      alert("Could not read file: " + e.message);
      return;
    }
    const parsed = parseScript(text);
    if (parsed.length === 0) {
      alert("No slides found in the script.\nLabels must match exactly:\n• HOOK SLIDE\n• TEXT ON TOP\n• TEXT ON BOTTOM\n• THE LESSON\n• [AFTER EFFECTS — VIDEO]");
      return;
    }
    const hasContent = state.slides.some(s => (s.text || "").trim() || s.media);
    if (hasContent) {
      if (!confirm(`Replace your current ${state.slides.length} slide(s) with ${parsed.length} slide(s) from the script?`)) {
        return;
      }
    }
    // Revoke any existing media URLs
    state.slides.forEach(s => { if (s.media?.url) URL.revokeObjectURL(s.media.url); });
    state.slides = parsed;
    saveState();
    rebuildAll();
  };

  // ==== Slide render factories ====

  const renderTemplates = {
    hook: "renderHook",
    top: "renderTop",
    bottom: "renderBottom",
    lesson: "renderLesson",
    video: "renderVideo",
    cta: "renderCta",
  };

  // Probe intrinsic dimensions of an uploaded file (needed for cover/zoom math).
  const probeMediaSize = (file, url) => new Promise(resolve => {
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.muted = true;
      v.preload = "metadata";
      v.onloadedmetadata = () => resolve({ w: v.videoWidth || 0, h: v.videoHeight || 0 });
      v.onerror = () => resolve({ w: 0, h: 0 });
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 });
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = url;
    }
  });

  // Media is mounted inside a .media-inner wrapper whose size is derived from
  // the media's natural dimensions × cover-scale × user-scale. This lets the
  // user zoom *out* past the cover-fit baseline (scale < 1 reveals the
  // previously-cropped edges instead of just shrinking a fixed cover crop).
  const mountMedia = (container, media) => {
    if (!container) return;
    container.innerHTML = "";
    container.style.backgroundImage = "";
    container.classList.remove("has-media");

    if (!media) return;

    container.classList.add("has-media");

    const inner = document.createElement("div");
    inner.className = "media-inner";

    // Once the media's intrinsic size is known, re-layout so it sizes correctly
    // even if the upload-time probe failed or localStorage-restored state had
    // stale/missing dimensions.
    const relayoutFromLive = (nw, nh) => {
      if (!nw || !nh) return;
      const card = container.closest(".preview-card");
      const slideId = card?.dataset.slideId;
      const slide = slideId ? state.slides.find(s => s.id === slideId) : null;
      if (!slide) return;
      slide.mediaNaturalW = nw;
      slide.mediaNaturalH = nh;
      applyMediaLayout(container, slide);
    };

    if (media.type.startsWith("video/")) {
      const el = Object.assign(document.createElement("video"), {
        src: media.url, muted: true, loop: true, autoplay: true, playsInline: true,
      });
      el.addEventListener("loadedmetadata", () => relayoutFromLive(el.videoWidth, el.videoHeight));
      inner.appendChild(el);
    } else {
      inner.style.backgroundImage = `url("${media.url}")`;
      inner.style.backgroundSize = "100% 100%";
      inner.style.backgroundRepeat = "no-repeat";
      // Probe via a separate <img> (background-image has no load event)
      const probe = new Image();
      probe.onload = () => relayoutFromLive(probe.naturalWidth, probe.naturalHeight);
      probe.src = media.url;
    }

    container.appendChild(inner);
  };

  const buildRender = (slide, idx) => {
    const tpl = document.getElementById(renderTemplates[slide.type]);
    if (!tpl) return null;
    const node = tpl.content.firstElementChild.cloneNode(true);

    const parsed = parseCopy(slide.text || "");

    // Shared: background media for HOOK / TOP / BOTTOM
    if (slide.media && (slide.type === "hook" || slide.type === "top" || slide.type === "bottom")) {
      node.classList.add("has-media-bg");
      mountMedia(node.querySelector(".media-bg"), slide.media);
    }
    // Propagate the edge-fade value to the slide as a CSS variable
    node.style.setProperty("--edge-fade", state.overrides.edge_fade ?? 30);

    if (slide.type === "hook") {
      node.querySelector(".hook-text").innerHTML = parsed;
      // Swipe hint only on the first slide
      const swipe = node.querySelector(".hook-swipe");
      if (swipe && idx !== 0) swipe.style.display = "none";
      const textEl = node.querySelector(".hook-text");
      if (textEl) textEl.style.fontSize = `${state.overrides.hook_font_size}px`;
    } else if (slide.type === "top" || slide.type === "bottom") {
      node.querySelector(".body-text").innerHTML = parsed;
      node.querySelector(".body-text").style.fontSize = `${state.overrides.body_font_size}px`;
      // Divider Y drives text region, image region, fade, and divider position.
      // All handled in CSS via --divider-y. Here we just set the variable.
      node.style.setProperty("--divider-y", `${state.overrides.divider_y}%`);
    } else if (slide.type === "lesson") {
      node.querySelector(".lesson-body").innerHTML = parsed;
      node.querySelector(".lesson-title").style.fontSize = `${state.overrides.lesson_title_size}px`;
      node.querySelector(".lesson-body").style.fontSize = `${state.overrides.body_font_size}px`;

      mountMedia(node.querySelector(".lesson-media"), slide.media);
    } else if (slide.type === "video") {
      mountMedia(node.querySelector(".video-slot"), slide.media);
    } else if (slide.type === "cta") {
      const variant = slide.ctaVariant ?? 1;
      const bg = node.querySelector(".cta-bg");
      bg.style.backgroundImage = `url("/static/bad_carousel/cta/CTA-Op${variant}.png")`;
    }

    return node;
  };

  // ==== Preview rendering ====

  const updatePreview = (slideId) => {
    const slide = state.slides.find(s => s.id === slideId);
    if (!slide) return;
    const idx = state.slides.findIndex(s => s.id === slideId);
    const previewCard = document.querySelector(`.preview-card[data-slide-id="${slideId}"]`);
    if (!previewCard) return;

    const scaler = previewCard.querySelector(".preview-scaler");
    scaler.innerHTML = "";
    const render = buildRender(slide, idx);
    if (render) scaler.appendChild(render);

    // Scale the 1080×1440 render to fit inside the preview frame width.
    // We set explicit pixel height on the frame so the grid row measures
    // correctly (Chromium sometimes shrinks grid rows to 0 when only
    // aspect-ratio defines height).
    const applyScale = () => {
      const frame = previewCard.querySelector(".preview-frame");
      const frameW = frame.clientWidth;
      if (!frameW) return requestAnimationFrame(applyScale);
      const scale = frameW / SLIDE_W;
      frame.style.height = `${SLIDE_H * scale}px`;
      scaler.style.transform = `scale(${scale})`;
      // Once the scaler is sized correctly, the media containers have real
      // clientWidth/Height — recompute the media layout so the natural-size
      // math lands on the right numbers.
      const mediaContainers = scaler.querySelectorAll(".media-bg, .lesson-media, .video-slot");
      mediaContainers.forEach(el => applyMediaLayout(el, slide));
    };
    requestAnimationFrame(applyScale);
  };

  const updateAllPreviews = () => {
    state.slides.forEach(s => updatePreview(s.id));
  };

  // ==== Editor rendering ====

  const slidesContainer = document.getElementById("slides");
  const previewsContainer = document.getElementById("previews");
  const slideTpl = document.getElementById("slideTemplate");
  const previewTpl = document.getElementById("previewTemplate");

  const rebuildSlideEditors = () => {
    slidesContainer.innerHTML = "";
    state.slides.forEach((slide, idx) => {
      const node = slideTpl.content.cloneNode(true);
      const card = node.querySelector(".slide-card");
      card.dataset.slideId = slide.id;
      node.querySelector(".slide-num").textContent = `Slide ${idx + 1}`;

      const typeSel = node.querySelector(".slide-type");
      typeSel.value = slide.type;
      typeSel.addEventListener("change", (e) => {
        slide.type = e.target.value;
        // Media carries over between types — user may want the same image
        // as a LESSON slot AND a HOOK background, etc.
        saveState();
        rebuildAll();
      });

      const textarea = node.querySelector(".slide-text");
      textarea.value = slide.text;
      textarea.addEventListener("input", (e) => {
        slide.text = e.target.value;
        saveState();
        updatePreview(slide.id);
      });

      // CTA variant selector — only visible for CTA slides
      const ctaRow = node.querySelector(".cta-variant-row");
      const ctaSelect = node.querySelector(".cta-variant");
      const isCta = slide.type === "cta";
      ctaRow.hidden = !isCta;
      textarea.hidden = isCta;
      if (isCta) {
        ctaSelect.value = String(slide.ctaVariant ?? 1);
        ctaSelect.addEventListener("change", (e) => {
          slide.ctaVariant = parseInt(e.target.value, 10) || 1;
          saveState();
          updatePreview(slide.id);
        });
      }

      // Media upload — available on all slide types except CTA.
      // Usage per type: hook/top/bottom = background; lesson = middle slot; video = fullscreen.
      const mediaDiv = node.querySelector(".media-upload");
      const mediaInput = node.querySelector(".media-input");
      const mediaLabel = node.querySelector(".media-label");
      const mediaClear = node.querySelector(".media-clear");
      mediaDiv.hidden = isCta;
      const promptFor = (type) => {
        if (type === "lesson") return "Upload image or video (fills middle slot)";
        if (type === "video")  return "Upload video (fills full slide)";
        return "Upload background image or video (optional)";
      };
      if (slide.media) {
        mediaLabel.textContent = slide.media.name;
        mediaClear.hidden = false;
      } else {
        mediaLabel.textContent = promptFor(slide.type);
        mediaClear.hidden = true;
      }
      mediaInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (slide.media?.url) URL.revokeObjectURL(slide.media.url);
        const url = URL.createObjectURL(file);
        const { w, h } = await probeMediaSize(file, url);
        slide.media = { name: file.name, type: file.type, url, file };
        slide.mediaNaturalW = w;
        slide.mediaNaturalH = h;
        slide.scale = 1;
        slide.translateX = 0;
        slide.translateY = 0;
        mediaLabel.textContent = file.name;
        mediaClear.hidden = false;
        updatePreview(slide.id);
      });
      mediaClear.addEventListener("click", () => {
        if (slide.media?.url) URL.revokeObjectURL(slide.media.url);
        slide.media = null;
        mediaLabel.textContent = promptFor(slide.type);
        mediaClear.hidden = true;
        mediaInput.value = "";
        updatePreview(slide.id);
      });

      node.querySelector(".move-up").addEventListener("click", () => moveSlide(slide.id, -1));
      node.querySelector(".move-down").addEventListener("click", () => moveSlide(slide.id, 1));
      node.querySelector(".duplicate").addEventListener("click", () => duplicateSlide(slide.id));
      node.querySelector(".delete").addEventListener("click", () => deleteSlide(slide.id));

      slidesContainer.appendChild(node);
    });
  };

  const rebuildPreviews = () => {
    previewsContainer.innerHTML = "";
    state.slides.forEach((slide, idx) => {
      const node = previewTpl.content.cloneNode(true);
      const card = node.querySelector(".preview-card");
      card.dataset.slideId = slide.id;
      node.querySelector(".preview-num").textContent = `Slide ${idx + 1}`;
      node.querySelector(".download-one").addEventListener("click", () => downloadOne(slide.id, idx + 1));
      previewsContainer.appendChild(node);
    });
    updateAllPreviews();
  };

  const rebuildAll = () => {
    rebuildSlideEditors();
    rebuildPreviews();
  };

  // ==== Slide ops ====

  const addSlide = () => {
    state.slides.push({ id: uid(), type: "top", text: "", media: null, positionX: 50, positionY: 50 });
    saveState();
    rebuildAll();
  };

  const addCta = () => {
    state.slides.push({ id: uid(), type: "cta", text: "", media: null, positionX: 50, positionY: 50, ctaVariant: 1 });
    saveState();
    rebuildAll();
  };

  const moveSlide = (id, delta) => {
    const idx = state.slides.findIndex(s => s.id === id);
    const target = idx + delta;
    if (target < 0 || target >= state.slides.length) return;
    [state.slides[idx], state.slides[target]] = [state.slides[target], state.slides[idx]];
    saveState();
    rebuildAll();
  };

  const duplicateSlide = (id) => {
    const idx = state.slides.findIndex(s => s.id === id);
    if (idx === -1) return;
    const src = state.slides[idx];
    const copy = { id: uid(), type: src.type, text: src.text, media: null, positionX: src.positionX ?? 50, positionY: src.positionY ?? 50 };
    state.slides.splice(idx + 1, 0, copy);
    saveState();
    rebuildAll();
  };

  const deleteSlide = (id) => {
    if (state.slides.length === 1) return;
    const slide = state.slides.find(s => s.id === id);
    if (slide?.media?.url) URL.revokeObjectURL(slide.media.url);
    state.slides = state.slides.filter(s => s.id !== id);
    saveState();
    rebuildAll();
  };

  // ==== Download ====

  // Render a slide that contains a video element as an actual video file.
  // Draws the video frames onto a 1080×1440 canvas with cover-crop + position
  // applied, and composites the static overlay (text, divider, etc.) on top.
  // Lazy-load ffmpeg.wasm once and cache the instance.
  let _ffmpegPromise = null;
  const getFfmpeg = () => {
    if (_ffmpegPromise) return _ffmpegPromise;
    _ffmpegPromise = (async () => {
      if (!window.FFmpegWASM) throw new Error("ffmpeg.wasm failed to load from CDN");
      const ffmpeg = new window.FFmpegWASM.FFmpeg();
      ffmpeg.on("log", ({ message }) => console.log("[ffmpeg]", message));
      await ffmpeg.load({
        coreURL: "/static/ffmpeg/ffmpeg-core.js",
        wasmURL: "/static/ffmpeg/ffmpeg-core.wasm",
      });
      return ffmpeg;
    })();
    return _ffmpegPromise;
  };

  // Read a video file's intrinsic dimensions + duration
  const probeVideoFile = (file) => new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    v.src = URL.createObjectURL(file);
    v.addEventListener("loadedmetadata", () => {
      const out = { vw: v.videoWidth, vh: v.videoHeight, duration: v.duration };
      URL.revokeObjectURL(v.src);
      resolve(out);
    }, { once: true });
    v.addEventListener("error", reject, { once: true });
    setTimeout(() => reject(new Error("video metadata load timeout")), 8000);
  });

  // Render the slide's static overlays (everything except the video) into a
  // transparent PNG blob at 1080×1440. Any opaque solid backgrounds are made
  // transparent so the video shows through wherever the overlay would be empty.
  const renderOverlayPng = async (slide, idx) => {
    const scratch = document.createElement("div");
    scratch.style.position = "fixed";
    scratch.style.left = "-99999px";
    scratch.style.top = "0";
    scratch.style.width = `${SLIDE_W}px`;
    scratch.style.height = `${SLIDE_H}px`;
    const render = buildRender(slide, idx);
    scratch.appendChild(render);
    document.body.appendChild(scratch);
    try {
      const videoEl = render.querySelector("video");
      if (videoEl) videoEl.style.visibility = "hidden";

      // Force transparent backgrounds on any container that would paint solid
      // black over the video area.
      const transparentify = [
        render,
        render.querySelector(".media-bg"),
        render.querySelector(".image-region"),
        render.querySelector(".lesson-media"),
        render.querySelector(".video-slot"),
      ].filter(Boolean);
      const prevBgs = transparentify.map(el => el.style.background);
      transparentify.forEach(el => { el.style.background = "transparent"; });

      await document.fonts.ready;
      const imgs = render.querySelectorAll("img");
      await Promise.all(Array.from(imgs).map(img =>
        img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; })
      ));
      let canvas;
      try {
        canvas = await html2canvas(render, {
          width: SLIDE_W, height: SLIDE_H, scale: 1, backgroundColor: null, useCORS: true,
        });
      } finally {
        transparentify.forEach((el, i) => { el.style.background = prevBgs[i]; });
      }
      return await new Promise(r => canvas.toBlob(r, "image/png"));
    } finally {
      scratch.remove();
    }
  };

  // Measure where the video slot sits within the 1080×1440 slide.
  const measureVideoBox = (slide, idx) => {
    const scratch = document.createElement("div");
    scratch.style.position = "fixed";
    scratch.style.left = "-99999px";
    scratch.style.top = "0";
    scratch.style.width = `${SLIDE_W}px`;
    scratch.style.height = `${SLIDE_H}px`;
    const render = buildRender(slide, idx);
    scratch.appendChild(render);
    document.body.appendChild(scratch);
    try {
      const videoEl = render.querySelector("video");
      if (!videoEl) return null;
      const slideRect = render.getBoundingClientRect();
      const videoRect = videoEl.getBoundingClientRect();
      return {
        x: Math.round(videoRect.left - slideRect.left),
        y: Math.round(videoRect.top - slideRect.top),
        w: Math.round(videoRect.width),
        h: Math.round(videoRect.height),
      };
    } finally {
      scratch.remove();
    }
  };

  const renderSlideAsVideo = async (slide, idx) => {
    const file = slide.media.file;
    const { vw, vh, duration } = await probeVideoFile(file);

    // Measure where the video sits inside the 1080×1440 slide so we can
    // compute the correct crop + placement.
    const box = measureVideoBox(slide, idx);
    if (!box) return null;
    const { x: vdX, y: vdY, w: vdW, h: vdH } = box;

    // Match the CSS layout: final size = (natural × cover-scale × user-scale),
    // centered in the container, then translated. Works for zoom-out (< 1,
    // letterbox) AND zoom-in (> 1, crop outside the viewport).
    const coverScale = Math.max(vdW / vw, vdH / vh);
    const S = Math.max(0.2, slide.scale ?? 1);
    const tX = slide.translateX ?? 0;
    const tY = slide.translateY ?? 0;
    let finalW = Math.round(vw * coverScale * S) & ~1;
    let finalH = Math.round(vh * coverScale * S) & ~1;
    finalW = Math.max(2, finalW);
    finalH = Math.max(2, finalH);
    // Overlay top-left inside the container (may be negative when zoomed in)
    const overlayX = Math.round((vdW - finalW) / 2 + tX);
    const overlayY = Math.round((vdH - finalH) / 2 + tY);

    // Overlays exist for all types except plain VIDEO (full-bleed).
    const hasOverlay = slide.type !== "video";

    let overlayBlob = null;
    if (hasOverlay) {
      overlayBlob = await renderOverlayPng(slide, idx);
    }

    const ffmpeg = await getFfmpeg();
    const inputName = "input_" + Math.random().toString(36).slice(2) + ".mp4";
    const overlayName = hasOverlay ? "overlay_" + Math.random().toString(36).slice(2) + ".png" : null;
    const outputName = "output_" + Math.random().toString(36).slice(2) + ".mp4";

    try {
      await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
      if (hasOverlay) {
        await ffmpeg.writeFile(overlayName, new Uint8Array(await overlayBlob.arrayBuffer()));
      }

      if (hasOverlay) {
        // For slides with text overlays: scale the video to (finalW × finalH),
        // place on a black canvas at (overlayX, overlayY), then apply the
        // pre-rendered overlay PNG on top.
        const filter = [
          `[0:v]scale=${finalW}:${finalH},setsar=1[vid]`,
          `color=c=black:s=${SLIDE_W}x${SLIDE_H}:d=${duration.toFixed(3)},format=yuva420p[bg]`,
          `[bg][vid]overlay=${vdX + overlayX}:${vdY + overlayY}:shortest=1[bgvid]`,
          `[bgvid][1:v]overlay=0:0:format=auto[out]`,
        ].join(";");

        await ffmpeg.exec([
          "-i", inputName,
          "-i", overlayName,
          "-filter_complex", filter,
          "-map", "[out]",
          "-map", "0:a?",
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac",
          "-shortest",
          outputName,
        ]);
      } else {
        // Plain VIDEO slide: scale + overlay on black at the computed position.
        const filter = [
          `[0:v]scale=${finalW}:${finalH},setsar=1[vid]`,
          `color=c=black:s=${SLIDE_W}x${SLIDE_H}:d=${duration.toFixed(3)},format=yuv420p[bg]`,
          `[bg][vid]overlay=${overlayX}:${overlayY}:shortest=1,format=yuv420p[out]`,
        ].join(";");

        await ffmpeg.exec([
          "-i", inputName,
          "-filter_complex", filter,
          "-map", "[out]",
          "-map", "0:a?",
          "-c:v", "libx264",
          "-preset", "ultrafast",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac",
          outputName,
        ]);
      }

      const data = await ffmpeg.readFile(outputName);
      return { blob: new Blob([data.buffer], { type: "video/mp4" }), ext: "mp4" };
    } finally {
      try { await ffmpeg.deleteFile(inputName); } catch (e) {}
      if (overlayName) { try { await ffmpeg.deleteFile(overlayName); } catch (e) {} }
      try { await ffmpeg.deleteFile(outputName); } catch (e) {}
    }
  };

  const renderSlideToBlob = async (slideId, idx) => {
    const slide = state.slides.find(s => s.id === slideId);
    if (!slide) return null;

    // Any slide with a video in it (VIDEO type OR video uploaded as background/
    // LESSON slot) gets rendered as an actual video, cover-cropped to 1080×1440.
    const hasVideo = slide.media?.type?.startsWith("video/");
    if (hasVideo) {
      return await renderSlideAsVideo(slide, idx);
    }

    // VIDEO type with no media: nothing to export.
    if (slide.type === "video") return null;

    // Render the slide at native 1080×1440 off-screen for html2canvas
    const scratch = document.createElement("div");
    scratch.style.position = "fixed";
    scratch.style.left = "-99999px";
    scratch.style.top = "0";
    scratch.style.width = `${SLIDE_W}px`;
    scratch.style.height = `${SLIDE_H}px`;
    const render = buildRender(slide, idx);
    scratch.appendChild(render);
    document.body.appendChild(scratch);

    // Wait a tick for images/fonts to load
    await document.fonts.ready;
    const imgs = render.querySelectorAll("img");
    await Promise.all(Array.from(imgs).map(img =>
      img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; })
    ));

    try {
      const canvas = await html2canvas(render, {
        width: SLIDE_W,
        height: SLIDE_H,
        scale: 1,
        backgroundColor: null,
        useCORS: true,
      });
      const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
      return { blob, ext: "png" };
    } finally {
      scratch.remove();
    }
  };

  const guessExt = (mime, name) => {
    if (mime.includes("mp4")) return "mp4";
    if (mime.includes("webm")) return "webm";
    if (mime.includes("mov") || mime.includes("quicktime")) return "mov";
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot + 1) : "bin";
  };

  const downloadOne = async (slideId, num) => {
    const idx = num - 1;
    const btn = document.querySelector(`.preview-card[data-slide-id="${slideId}"] .download-one`);
    const orig = btn?.textContent;
    const slide = state.slides.find(s => s.id === slideId);
    const isVideo = slide?.media?.type?.startsWith("video/");
    if (btn) {
      btn.textContent = isVideo ? "Encoding video..." : "Rendering...";
      btn.disabled = true;
    }
    try {
      // Hook ffmpeg progress to the button text so the user sees it working
      let ffmpegHooked = false;
      if (isVideo) {
        try {
          const ff = await getFfmpeg();
          if (!ffmpegHooked) {
            ff.on("progress", ({ progress }) => {
              if (btn) btn.textContent = `Encoding ${Math.round((progress || 0) * 100)}%`;
            });
            ffmpegHooked = true;
          }
        } catch (e) {
          alert("Couldn't load the video encoder (ffmpeg.wasm). Check your connection and try again.\n\n" + (e.message || e));
          return;
        }
      }
      const result = await renderSlideToBlob(slideId, idx);
      if (!result) {
        alert(isVideo && !slide.media
          ? "Re-upload the video — browser state was cleared on refresh."
          : "Nothing to download for this slide.");
        return;
      }
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `slide_${String(num).padStart(2, "0")}.${result.ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error("Export failed:", e);
      alert("Export failed:\n" + (e.message || e));
    } finally {
      if (btn) { btn.textContent = orig; btn.disabled = false; }
    }
  };

  const downloadAll = async () => {
    const btn = document.getElementById("downloadAll");
    const orig = btn.textContent;
    btn.textContent = "Rendering...";
    btn.disabled = true;
    try {
      // If any slide has video, warm up ffmpeg once up front
      const anyVideo = state.slides.some(s => s.media?.type?.startsWith("video/"));
      if (anyVideo) {
        btn.textContent = "Loading encoder...";
        try {
          const ff = await getFfmpeg();
          ff.on("progress", ({ progress }) => {
            btn.textContent = `Encoding ${Math.round((progress || 0) * 100)}%`;
          });
        } catch (e) {
          alert("Couldn't load the video encoder. Check your connection and try again.\n\n" + (e.message || e));
          return;
        }
      }
      const zip = new JSZip();
      for (let i = 0; i < state.slides.length; i++) {
        const slide = state.slides[i];
        btn.textContent = `Slide ${i + 1}/${state.slides.length}...`;
        const result = await renderSlideToBlob(slide.id, i);
        if (result) {
          zip.file(`slide_${String(i + 1).padStart(2, "0")}.${result.ext}`, result.blob);
        }
      }
      btn.textContent = "Packaging ZIP...";
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bad-carousel.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error("Export failed:", e);
      alert("Export failed:\n" + (e.message || e));
    } finally {
      btn.textContent = orig;
      btn.disabled = false;
    }
  };

  // ==== Drag-to-pan uploaded media ====

  const DRAG_SELECTORS = ".media-bg, .lesson-media, .video-slot";

  // Size and position the media element so S=1 matches cover-fit, S<1 reveals
  // previously-cropped edges (with black bars), and S>1 zooms into the image.
  const applyMediaLayout = (mediaEl, slide) => {
    const inner = mediaEl.querySelector(".media-inner");
    if (!inner) return;
    const cw = mediaEl.clientWidth;
    const ch = mediaEl.clientHeight;
    if (!cw || !ch) return;

    let nw = slide.mediaNaturalW || 0;
    let nh = slide.mediaNaturalH || 0;

    // Fallback: if probeMediaSize didn't give us dimensions, read them off
    // the live DOM element (video.videoWidth / img.naturalWidth).
    if (!nw || !nh) {
      const vidEl = inner.querySelector("video");
      if (vidEl && vidEl.videoWidth) { nw = vidEl.videoWidth; nh = vidEl.videoHeight; }
    }

    if (!nw || !nh) {
      // Still no dimensions — cover-fit to container as a safe fallback so
      // the media doesn't render at natural size in the top-left corner.
      inner.style.position = "absolute";
      inner.style.top = "0";
      inner.style.left = "0";
      inner.style.width = `${cw}px`;
      inner.style.height = `${ch}px`;
      inner.style.transform = "";
      return;
    }

    // Cache for future layout calls
    slide.mediaNaturalW = nw;
    slide.mediaNaturalH = nh;

    const coverScale = Math.max(cw / nw, ch / nh);
    const S = slide.scale ?? 1;
    const finalW = nw * coverScale * S;
    const finalH = nh * coverScale * S;
    const tx = slide.translateX ?? 0;
    const ty = slide.translateY ?? 0;

    inner.style.position = "absolute";
    inner.style.top = "50%";
    inner.style.left = "50%";
    inner.style.width = `${finalW}px`;
    inner.style.height = `${finalH}px`;
    inner.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`;
  };

  // Back-compat alias — existing callers still reference the old name.
  const applyMediaTransform = applyMediaLayout;

  const setupMediaDrag = () => {
    let drag = null;

    const getPoint = (e) => e.touches?.[0] ?? e;

    // Map a screen-pixel delta to a render-pixel delta by undoing the preview's
    // scale-down. At preview scale 0.5, 1 screen px = 2 render px.
    const previewScale = (card) => {
      const frame = card.querySelector(".preview-frame");
      if (!frame) return 1;
      const w = frame.clientWidth;
      return w > 0 ? SLIDE_W / w : 1;
    };

    const onDown = (e) => {
      const mediaEl = e.target.closest(DRAG_SELECTORS);
      if (!mediaEl) return;
      if (!mediaEl.classList.contains("has-media")) return;
      const card = e.target.closest(".preview-card");
      if (!card) return;
      const slide = state.slides.find(s => s.id === card.dataset.slideId);
      if (!slide || !slide.media) return;

      e.preventDefault();
      const point = getPoint(e);
      drag = {
        slide,
        mediaEl,
        card,
        startX: point.clientX,
        startY: point.clientY,
        startTx: slide.translateX ?? 0,
        startTy: slide.translateY ?? 0,
        scaleFactor: previewScale(card),
      };
      document.body.classList.add("dragging-media");
    };

    // Snap translate values when an image edge (or center) is within threshold
    // of a container edge (or center). Prevents awkward near-misses.
    const SNAP_PX = 50;
    const snapAxis = (t, targets) => {
      for (const target of targets) {
        if (Math.abs(t - target) < SNAP_PX) return target;
      }
      return t;
    };
    const snapTranslate = (tx, ty, slide, cw, ch) => {
      const nw = slide.mediaNaturalW || 0;
      const nh = slide.mediaNaturalH || 0;
      if (!nw || !nh || !cw || !ch) return { tx, ty };
      const coverScale = Math.max(cw / nw, ch / nh);
      const S = slide.scale ?? 1;
      const fW = nw * coverScale * S;
      const fH = nh * coverScale * S;
      // X: center (0), image-left flush with container-left, image-right flush right
      const sx = snapAxis(tx, [0, fW / 2 - cw / 2, cw / 2 - fW / 2]);
      const sy = snapAxis(ty, [0, fH / 2 - ch / 2, ch / 2 - fH / 2]);
      return { tx: sx, ty: sy };
    };

    const onMove = (e) => {
      if (!drag) return;
      const point = getPoint(e);
      const dx = (point.clientX - drag.startX) * drag.scaleFactor;
      const dy = (point.clientY - drag.startY) * drag.scaleFactor;
      const rawTx = drag.startTx + dx;
      const rawTy = drag.startTy + dy;
      const cw = drag.mediaEl.clientWidth;
      const ch = drag.mediaEl.clientHeight;
      const { tx, ty } = snapTranslate(rawTx, rawTy, drag.slide, cw, ch);
      drag.slide.translateX = tx;
      drag.slide.translateY = ty;
      applyMediaLayout(drag.mediaEl, drag.slide);
    };

    const onUp = () => {
      if (!drag) return;
      drag = null;
      document.body.classList.remove("dragging-media");
      saveState();
    };

    // Wheel/trackpad zoom. Min 0.3 lets the user zoom out PAST cover-fit, which
    // reveals the image edges that cover-fit would otherwise crop out.
    const onWheel = (e) => {
      const mediaEl = e.target.closest(DRAG_SELECTORS);
      if (!mediaEl || !mediaEl.classList.contains("has-media")) return;
      const card = e.target.closest(".preview-card");
      if (!card) return;
      const slide = state.slides.find(s => s.id === card.dataset.slideId);
      if (!slide || !slide.media) return;
      e.preventDefault();
      const currentScale = slide.scale ?? 1;
      const factor = Math.pow(1.0015, -e.deltaY);
      const newScale = Math.max(0.3, Math.min(6, currentScale * factor));
      slide.scale = newScale;
      applyMediaLayout(mediaEl, slide);
      clearTimeout(onWheel._save);
      onWheel._save = setTimeout(saveState, 300);
    };

    const previewsEl = document.getElementById("previews");
    previewsEl.addEventListener("mousedown", onDown);
    previewsEl.addEventListener("touchstart", onDown, { passive: false });
    previewsEl.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    window.addEventListener("touchcancel", onUp);
  };

  // ==== Advanced settings ====

  const advancedFields = ["divider_y", "hook_font_size", "body_font_size", "lesson_title_size", "edge_fade"];
  const bindAdvanced = () => {
    advancedFields.forEach(field => {
      const input = document.getElementById(field);
      if (!input) return;
      input.value = state.overrides[field];
      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        if (!isNaN(v)) state.overrides[field] = v;
        saveState();
        updateAllPreviews();
      });
    });
  };

  // ==== Init ====

  const init = () => {
    loadState();
    document.getElementById("addSlide").addEventListener("click", addSlide);
    document.getElementById("addCta").addEventListener("click", addCta);
    document.getElementById("downloadAll").addEventListener("click", downloadAll);
    document.getElementById("scriptUpload").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) loadScript(file);
      e.target.value = "";
    });
    bindAdvanced();
    setupMediaDrag();
    setupSessionMenu();
    rebuildAll();
    window.addEventListener("resize", updateAllPreviews);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
