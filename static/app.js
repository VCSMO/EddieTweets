(() => {
  const state = {
    format: "carousel",
    theme: "dark",
    profile: "eddie",
    slides: [],
    overrides: {},
    presets: null,
    profiles: null, // { default, profiles: { id: {display_name, handle} } }
  };

  // --- State helpers ---
  const uid = () => Math.random().toString(36).slice(2, 10);

  const loadState = () => {
    try {
      const saved = localStorage.getItem("tcb_state");
      if (saved) {
        const obj = JSON.parse(saved);
        state.format = obj.format || "carousel";
        state.theme = obj.theme === "light" ? "light" : "dark";
        state.profile = obj.profile || "eddie";
        state.slides = obj.slides || [];
        state.overrides = obj.overrides || {};
      }
    } catch (e) {}
    if (state.slides.length === 0) {
      state.slides = [{ id: uid(), text: "Write your tweet here.\n\nAdd more lines with a blank line between." }];
    }
  };

  const saveState = () => {
    try {
      localStorage.setItem("tcb_state", JSON.stringify({
        format: state.format,
        theme: state.theme,
        profile: state.profile,
        slides: state.slides,
        overrides: state.overrides,
      }));
    } catch (e) {}
  };

  // --- Debounce ---
  const debounce = (fn, ms = 400) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  // --- Rendering ---
  const renderSingle = async (slideId) => {
    const slide = state.slides.find(s => s.id === slideId);
    if (!slide) return;

    const previewEl = document.querySelector(`.preview-card[data-slide-id="${slideId}"]`);
    if (!previewEl) return;

    const img = previewEl.querySelector(".preview-img");
    const loader = previewEl.querySelector(".preview-loader");
    img.classList.add("loading");
    loader.classList.add("active");

    try {
      const res = await fetch("/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: slide.text,
          format: state.format,
          theme: state.theme,
          profile: state.profile,
          overrides: state.overrides,
        }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (img.dataset.currentUrl) URL.revokeObjectURL(img.dataset.currentUrl);
      img.dataset.currentUrl = url;
      img.src = url;
      img.onload = () => {
        img.classList.remove("loading");
        loader.classList.remove("active");
      };
    } catch (e) {
      console.error("Render failed:", e);
      loader.textContent = "Error";
    }
  };

  const renderAll = debounce(() => {
    state.slides.forEach(s => renderSingle(s.id));
  }, 250);

  // --- DOM rendering ---
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
      const textarea = node.querySelector(".slide-text");
      textarea.value = slide.text;

      textarea.addEventListener("input", (e) => {
        slide.text = e.target.value;
        saveState();
        renderSingle(slide.id);
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
    // Trigger render for each
    state.slides.forEach(s => renderSingle(s.id));
  };

  let rebuildAll = () => {
    rebuildSlideEditors();
    rebuildPreviews();
    updateFormatLabel();
  };

  // --- Slide operations ---
  let addSlide = () => {
    state.slides.push({ id: uid(), text: "" });
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
    const copy = { id: uid(), text: state.slides[idx].text };
    state.slides.splice(idx + 1, 0, copy);
    saveState();
    rebuildAll();
  };

  const deleteSlide = (id) => {
    if (state.slides.length === 1) return;
    state.slides = state.slides.filter(s => s.id !== id);
    saveState();
    rebuildAll();
  };

  // --- Thread script parser ---
  // Splits a pasted thread into individual tweets. Recognized formats:
  //   "1." / "2." / "3." (or 1) 2) 3)) at the start of a line
  //   "---" or "===" on its own line
  // If no markers are found, falls back to triple-newline boundaries.
  // Within each tweet, blank lines are preserved as paragraph breaks.
  const parseThreadScript = (raw) => {
    const text = (raw || "").trim();
    if (!text) return [];

    const markerRe = /^\s*\d+[\.\)]\s*/;
    const separatorRe = /^\s*(?:---+|===+)\s*$/;

    const lines = text.split("\n");
    const slides = [];
    let current = [];
    let foundMarker = false;

    const flush = () => {
      const slide = current.join("\n").trim();
      if (slide) slides.push(slide);
      current = [];
    };

    for (const line of lines) {
      if (separatorRe.test(line)) {
        foundMarker = true;
        flush();
      } else if (markerRe.test(line)) {
        foundMarker = true;
        flush();
        const remainder = line.replace(markerRe, "");
        if (remainder.trim()) current.push(remainder);
      } else {
        current.push(line);
      }
    }
    flush();

    if (!foundMarker) {
      // No explicit markers — try triple-newline boundaries
      const blocks = text.split(/\n{3,}/).map(s => s.trim()).filter(Boolean);
      if (blocks.length > 1) return blocks;
      return [text];
    }

    // Collapse 3+ blank lines inside a slide down to a single blank line,
    // since that's what the renderer interprets as a paragraph break.
    return slides.map(s => s.replace(/\n{3,}/g, "\n\n"));
  };

  // --- Import Thread modal ---
  const importEls = () => ({
    modal: document.getElementById("importModal"),
    textarea: document.getElementById("importTextarea"),
    count: document.getElementById("importCount"),
    confirm: document.getElementById("confirmImport"),
  });

  const updateImportCount = () => {
    const { textarea, count, confirm } = importEls();
    if (!textarea || !count || !confirm) return;
    const parsed = parseThreadScript(textarea.value);
    const n = parsed.length;
    if (n === 0) {
      count.textContent = "0 slides detected";
      count.classList.remove("has-slides");
      confirm.disabled = true;
      confirm.textContent = "Import";
    } else {
      count.textContent = `${n} slide${n === 1 ? "" : "s"} detected`;
      count.classList.add("has-slides");
      confirm.disabled = false;
      confirm.textContent = `Import ${n} slide${n === 1 ? "" : "s"}`;
    }
  };

  const openImportModal = () => {
    const { modal, textarea } = importEls();
    if (!modal) return;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    updateImportCount();
    setTimeout(() => textarea?.focus(), 50);
  };

  const closeImportModal = () => {
    const { modal } = importEls();
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  };

  const performImport = () => {
    const { textarea } = importEls();
    if (!textarea) return;
    const parsed = parseThreadScript(textarea.value);
    if (parsed.length === 0) return;

    const mode = document.querySelector("input[name='importMode']:checked")?.value || "replace";
    const newSlides = parsed.map(text => ({ id: uid(), text }));

    if (mode === "replace") {
      state.slides = newSlides;
    } else {
      state.slides = state.slides.concat(newSlides);
    }
    saveState();
    rebuildAll();
    textarea.value = "";
    closeImportModal();
  };

  // --- Downloads ---
  const downloadOne = async (slideId, num) => {
    const slide = state.slides.find(s => s.id === slideId);
    if (!slide) return;
    const isVideo = state.format === "single";
    const endpoint = isVideo ? "/render-video" : "/render";
    const ext = isVideo ? "mp4" : "png";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: slide.text,
        format: state.format,
        theme: state.theme,
        overrides: state.overrides,
      }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `slide_${num}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadAll = async () => {
    const btn = document.getElementById("downloadAll");
    const original = btn.textContent;
    btn.textContent = "Rendering...";
    btn.disabled = true;
    try {
      const res = await fetch("/render-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slides: state.slides.map(s => s.text),
          format: state.format,
          theme: state.theme,
          profile: state.profile,
          overrides: state.overrides,
        }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${state.format}-slides.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      btn.textContent = original;
      btn.disabled = false;
    }
  };

  // --- Format toggle ---
  const setFormat = (fmt) => {
    state.format = fmt;
    document.querySelectorAll(".fmt-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.fmt === fmt);
    });
    updateAdvancedDefaults();
    saveState();
    updateFormatLabel();
    renderAll();
  };

  // --- Theme toggle (for the rendered tweet, not the UI) ---
  const setTheme = (theme) => {
    if (theme !== "light" && theme !== "dark") return;
    if (state.theme === theme) return;
    state.theme = theme;
    document.querySelectorAll(".theme-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.theme === theme);
    });
    saveState();
    renderAll();
  };

  // --- Profile picker ---
  const refreshProfileButton = () => {
    const profiles = state.profiles?.profiles || {};
    const cur = profiles[state.profile] || profiles[state.profiles?.default];
    if (!cur) return;
    const btn = document.getElementById("profileBtn");
    if (!btn) return;
    btn.querySelector(".profile-name").textContent = cur.display_name;
    btn.querySelector(".profile-handle").textContent = cur.handle;
    btn.querySelector(".profile-avatar").src = `/pfp/${state.profile}`;
  };

  const buildProfileMenu = () => {
    const menu = document.getElementById("profileMenu");
    if (!menu || !state.profiles) return;
    menu.innerHTML = "";
    Object.entries(state.profiles.profiles).forEach(([pid, info]) => {
      const opt = document.createElement("button");
      opt.className = "profile-option" + (pid === state.profile ? " active" : "");
      opt.type = "button";
      opt.dataset.profile = pid;
      opt.innerHTML = `
        <img src="/pfp/${pid}" alt="" />
        <div class="meta">
          <strong></strong>
          <span></span>
        </div>
      `;
      opt.querySelector("strong").textContent = info.display_name;
      opt.querySelector("span").textContent = info.handle;
      opt.addEventListener("click", () => {
        setProfile(pid);
        closeProfileMenu();
      });
      menu.appendChild(opt);
    });
  };

  const openProfileMenu = () => {
    const menu = document.getElementById("profileMenu");
    const btn = document.getElementById("profileBtn");
    if (!menu || !btn) return;
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  };

  const closeProfileMenu = () => {
    const menu = document.getElementById("profileMenu");
    const btn = document.getElementById("profileBtn");
    if (!menu || !btn) return;
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  };

  const setProfile = (pid) => {
    if (!state.profiles?.profiles[pid]) return;
    if (state.profile === pid) return;
    state.profile = pid;
    refreshProfileButton();
    buildProfileMenu();
    saveState();
    renderAll();
  };

  const updateFormatLabel = () => {
    const preset = state.presets?.[state.format];
    if (preset) {
      document.getElementById("formatLabel").textContent = `${preset.width} × ${preset.height}`;
    }
  };

  // --- Advanced settings ---
  const advancedFields = [
    "pfp_zoom", "pfp_size", "font_name_size", "font_handle_size",
    "font_tweet_size", "line_gap", "row_gap", "para_gap", "header_gap"
  ];

  const updateAdvancedDefaults = () => {
    const preset = state.presets?.[state.format];
    if (!preset) return;
    advancedFields.forEach(field => {
      const input = document.getElementById(field);
      if (!input) return;
      const override = state.overrides[field];
      const presetVal = preset[field];
      const defaultVal = { pfp_zoom: 1.18, line_gap: 18, row_gap: 32, para_gap: 42, header_gap: 44 }[field];
      input.placeholder = String(presetVal ?? defaultVal ?? "");
      if (override !== undefined && override !== null) {
        input.value = override;
      } else {
        input.value = "";
      }
    });
  };

  const bindAdvanced = () => {
    advancedFields.forEach(field => {
      const input = document.getElementById(field);
      if (!input) return;
      input.addEventListener("input", debounce(() => {
        const v = input.value.trim();
        if (v === "") {
          delete state.overrides[field];
        } else {
          const num = parseFloat(v);
          if (!isNaN(num)) state.overrides[field] = num;
        }
        saveState();
        renderAll();
      }, 300));
    });
  };

  // --- Mobile swipe carousel (syncs editor + preview) ---
  const mobileMedia = window.matchMedia("(max-width: 900px)");
  let currentSlideIndex = 0;
  let carousel = null;

  const initMobileCarousel = () => {
    const slidesEl = document.getElementById("slides");
    const previewsEl = document.getElementById("previews");
    const dotsEl = document.querySelector(".slide-dots");
    const counterEl = document.querySelector(".slide-counter");

    // Which carousel is the user actively interacting with.
    // Scroll events from the *other* one are ignored while this is set,
    // which prevents the two scrollers from fighting each other.
    let activeEl = null;
    let settleTimer = null;

    const slideWidthOf = (el) => {
      const child = el.firstElementChild;
      if (!child) return 1;
      const gap = parseFloat(getComputedStyle(el).columnGap || "0") || 0;
      return child.offsetWidth + gap;
    };

    const indexOf = (el) => {
      const max = Math.max(0, el.children.length - 1);
      if (max === 0) return 0;
      return Math.min(max, Math.max(0, Math.round(el.scrollLeft / slideWidthOf(el))));
    };

    const scrollToIndex = (el, idx, smooth = true) => {
      if (!el.children[idx]) return;
      el.scrollTo({ left: idx * slideWidthOf(el), behavior: smooth ? "smooth" : "auto" });
    };

    const updateIndicator = (idx) => {
      currentSlideIndex = Math.max(0, Math.min(idx, state.slides.length - 1));
      if (counterEl) counterEl.textContent = `${currentSlideIndex + 1} / ${state.slides.length}`;
      dotsEl?.querySelectorAll(".slide-dot").forEach((d, i) => {
        d.classList.toggle("active", i === currentSlideIndex);
      });
    };

    const rebuildDots = () => {
      if (!dotsEl) return;
      dotsEl.innerHTML = "";
      state.slides.forEach((_, i) => {
        const dot = document.createElement("button");
        dot.className = "slide-dot" + (i === currentSlideIndex ? " active" : "");
        dot.setAttribute("aria-label", `Go to slide ${i + 1}`);
        dot.addEventListener("click", () => {
          activeEl = null;
          scrollToIndex(slidesEl, i);
          scrollToIndex(previewsEl, i);
          updateIndicator(i);
        });
        dotsEl.appendChild(dot);
      });
      updateIndicator(currentSlideIndex);
    };

    // Touch ownership: mark which carousel the finger is on.
    // This makes sure only the user-driven scroller triggers a sync.
    const claim = (el) => () => { activeEl = el; };
    const release = () => {
      // Hold ownership briefly past touchend so momentum-scroll events
      // from the same element still count, and the target's programmatic
      // scroll doesn't steal ownership.
      setTimeout(() => { activeEl = null; }, 400);
    };

    [slidesEl, previewsEl].forEach((el) => {
      el.addEventListener("touchstart", claim(el), { passive: true });
      el.addEventListener("pointerdown", claim(el), { passive: true });
      el.addEventListener("touchend", release, { passive: true });
      el.addEventListener("touchcancel", release, { passive: true });
    });

    const onScroll = (source) => {
      if (!mobileMedia.matches) return;
      // Ignore scrolls on the carousel the user is NOT actively touching.
      // If no one is touching (activeEl===null), we treat it as idle and skip too.
      if (activeEl !== source) return;

      // Live-update indicator while swiping
      const idx = indexOf(source);
      if (idx !== currentSlideIndex) updateIndicator(idx);

      // Sync target only after the source has settled (~120ms of no scroll events)
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        const finalIdx = indexOf(source);
        const target = source === slidesEl ? previewsEl : slidesEl;
        if (indexOf(target) !== finalIdx) {
          scrollToIndex(target, finalIdx, false); // instant, not smooth → no animation fight
        }
      }, 120);
    };

    slidesEl.addEventListener("scroll", () => onScroll(slidesEl), { passive: true });
    previewsEl.addEventListener("scroll", () => onScroll(previewsEl), { passive: true });

    return {
      rebuildDots,
      snapToIndex: (idx) => {
        if (!mobileMedia.matches) return;
        activeEl = null;
        scrollToIndex(slidesEl, idx, false);
        scrollToIndex(previewsEl, idx, false);
        updateIndicator(idx);
      },
    };
  };

  // Wrap rebuildAll so it also rebuilds carousel dots + keeps scroll position
  const _origRebuildAll = rebuildAll;
  rebuildAll = () => {
    _origRebuildAll();
    if (carousel) {
      carousel.rebuildDots();
      // After DOM rebuild, re-snap to the current slide so we don't jump to 0
      requestAnimationFrame(() => carousel.snapToIndex(currentSlideIndex));
    }
  };

  // Scroll to the newest slide after adding one
  const _origAddSlide = addSlide;
  addSlide = () => {
    _origAddSlide();
    const last = state.slides.length - 1;
    currentSlideIndex = last;
    requestAnimationFrame(() => carousel?.snapToIndex(last));
  };

  // --- Init ---
  const init = async () => {
    loadState();

    // Load presets and profiles from server in parallel
    try {
      const [fmts, profs] = await Promise.all([
        fetch("/formats").then(r => r.json()),
        fetch("/profiles").then(r => r.json()).catch(() => null),
      ]);
      state.presets = fmts;
      state.profiles = profs;
      // Validate persisted profile choice
      if (profs && !profs.profiles[state.profile]) {
        state.profile = profs.default;
      }
    } catch (e) {
      console.error(e);
    }

    // Format toggle
    document.querySelectorAll(".fmt-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.fmt === state.format);
      b.addEventListener("click", () => setFormat(b.dataset.fmt));
    });

    // Theme toggle (for rendered tweet)
    document.querySelectorAll(".theme-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.theme === state.theme);
      b.addEventListener("click", () => setTheme(b.dataset.theme));
    });

    // Profile picker — only shown when there's more than one profile to choose from
    const profileCount = state.profiles ? Object.keys(state.profiles.profiles || {}).length : 0;
    const profilePicker = document.querySelector(".profile-picker");
    if (profilePicker) {
      profilePicker.hidden = profileCount <= 1;
    }
    refreshProfileButton();
    buildProfileMenu();
    const profileBtn = document.getElementById("profileBtn");
    if (profileBtn && profileCount > 1) {
      profileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = document.getElementById("profileMenu");
        if (menu.hidden) openProfileMenu();
        else closeProfileMenu();
      });
    }
    // Close menu when clicking elsewhere
    document.addEventListener("click", (e) => {
      const picker = e.target.closest(".profile-picker");
      if (!picker) closeProfileMenu();
    });
    // Close on escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeProfileMenu();
    });

    document.getElementById("addSlide").addEventListener("click", addSlide);
    document.getElementById("downloadAll").addEventListener("click", downloadAll);

    // Import Thread modal
    const importBtn = document.getElementById("importThread");
    if (importBtn) importBtn.addEventListener("click", openImportModal);

    const modal = document.getElementById("importModal");
    if (modal) {
      // Any [data-close] element (backdrop, ✕ button, Cancel) closes the modal
      modal.querySelectorAll("[data-close]").forEach(el => {
        el.addEventListener("click", closeImportModal);
      });
    }
    const importTextarea = document.getElementById("importTextarea");
    if (importTextarea) {
      importTextarea.addEventListener("input", updateImportCount);
    }
    const confirmImportBtn = document.getElementById("confirmImport");
    if (confirmImportBtn) {
      confirmImportBtn.addEventListener("click", performImport);
    }
    document.addEventListener("keydown", (e) => {
      const m = document.getElementById("importModal");
      if (e.key === "Escape" && m && !m.hidden) closeImportModal();
    });

    bindAdvanced();
    updateAdvancedDefaults();
    carousel = initMobileCarousel();
    rebuildAll();
  };

  init();
})();
