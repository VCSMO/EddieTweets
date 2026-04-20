(() => {
  const state = {
    format: "carousel",
    slides: [],
    overrides: {},
    presets: null,
  };

  // --- State helpers ---
  const uid = () => Math.random().toString(36).slice(2, 10);

  const loadState = () => {
    try {
      const saved = localStorage.getItem("tcb_state");
      if (saved) {
        const obj = JSON.parse(saved);
        state.format = obj.format || "carousel";
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

  const updateFormatLabel = () => {
    const preset = state.presets?.[state.format];
    if (preset) {
      document.getElementById("formatLabel").textContent = `${preset.width} × ${preset.height}`;
    }
  };

  // --- Advanced settings ---
  const advancedFields = [
    "pfp_zoom", "pfp_size", "font_name_size", "font_handle_size",
    "font_tweet_size", "line_gap", "para_gap", "header_gap"
  ];

  const updateAdvancedDefaults = () => {
    const preset = state.presets?.[state.format];
    if (!preset) return;
    advancedFields.forEach(field => {
      const input = document.getElementById(field);
      if (!input) return;
      const override = state.overrides[field];
      const presetVal = preset[field];
      const defaultVal = { pfp_zoom: 1.18, line_gap: 18, para_gap: 36, header_gap: 44 }[field];
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
  let syncing = false;
  let carousel = null;

  const initMobileCarousel = () => {
    const slidesEl = document.getElementById("slides");
    const previewsEl = document.getElementById("previews");
    const dotsEl = document.querySelector(".slide-dots");
    const counterEl = document.querySelector(".slide-counter");

    const slideWidthOf = (el) => {
      const child = el.firstElementChild;
      if (!child) return 1;
      const gap = parseFloat(getComputedStyle(el).columnGap || "0") || 0;
      return child.offsetWidth + gap;
    };

    const indexOf = (el) => {
      const max = Math.max(0, el.children.length - 1);
      return Math.min(max, Math.max(0, Math.round(el.scrollLeft / slideWidthOf(el))));
    };

    const scrollToIndex = (el, idx, smooth = true) => {
      if (!el.children[idx]) return;
      el.scrollTo({ left: idx * slideWidthOf(el), behavior: smooth ? "smooth" : "auto" });
    };

    const updateIndicator = (idx) => {
      currentSlideIndex = Math.min(idx, state.slides.length - 1);
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
          scrollToIndex(slidesEl, i);
          scrollToIndex(previewsEl, i);
          updateIndicator(i);
        });
        dotsEl.appendChild(dot);
      });
      updateIndicator(currentSlideIndex);
    };

    const handleScroll = (source) => {
      if (!mobileMedia.matches || syncing) return;
      const idx = indexOf(source);
      if (idx === currentSlideIndex) return;
      syncing = true;
      const target = source === slidesEl ? previewsEl : slidesEl;
      scrollToIndex(target, idx);
      updateIndicator(idx);
      setTimeout(() => { syncing = false; }, 120);
    };

    slidesEl.addEventListener("scroll", () => handleScroll(slidesEl), { passive: true });
    previewsEl.addEventListener("scroll", () => handleScroll(previewsEl), { passive: true });

    return {
      rebuildDots,
      snapToIndex: (idx) => {
        if (!mobileMedia.matches) return;
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

    // Load presets from server
    try {
      const res = await fetch("/formats");
      state.presets = await res.json();
    } catch (e) {
      console.error(e);
    }

    // Format toggle
    document.querySelectorAll(".fmt-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.fmt === state.format);
      b.addEventListener("click", () => setFormat(b.dataset.fmt));
    });

    document.getElementById("addSlide").addEventListener("click", addSlide);
    document.getElementById("downloadAll").addEventListener("click", downloadAll);

    bindAdvanced();
    updateAdvancedDefaults();
    carousel = initMobileCarousel();
    rebuildAll();
  };

  init();
})();
