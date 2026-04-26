"""Flask app for generating tweet carousel slides."""
from flask import Flask, render_template, request, send_file, jsonify, send_from_directory
from tweet_render import render_tweet, FORMATS, PROFILES, DEFAULT_PROFILE, png_bytes_to_mp4_bytes
import io
import zipfile
import os

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/bad-carousel")
def bad_carousel():
    return render_template("bad_carousel.html")


@app.route("/fonts/<path:filename>")
def serve_fonts(filename):
    return send_from_directory(os.path.join(BASE_DIR, "fonts"), filename)


def _build_config(data, default_fmt):
    """Merge format preset + overrides + theme + profile into a single kwargs dict."""
    fmt = data.get("format", default_fmt)
    overrides = data.get("overrides", {}) or {}
    theme = data.get("theme", "dark")
    if theme not in ("light", "dark"):
        theme = "dark"

    profile = data.get("profile", DEFAULT_PROFILE)
    if profile not in PROFILES:
        profile = DEFAULT_PROFILE

    cfg = FORMATS.get(fmt, FORMATS[default_fmt]).copy()
    cfg.update({k: v for k, v in overrides.items() if v is not None})
    cfg["theme"] = theme
    cfg["profile"] = profile
    return cfg, theme, fmt


@app.route("/render", methods=["POST"])
def render_single():
    """Render a single slide and return PNG bytes."""
    data = request.get_json()
    text = data.get("text", "")
    cfg, _theme, _fmt = _build_config(data, "carousel")

    img = render_tweet(text, **cfg)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png")


@app.route("/render-video", methods=["POST"])
def render_video():
    """Render a single slide and return it as a 7s silent MP4 (9:16)."""
    data = request.get_json()
    text = data.get("text", "")
    cfg, theme, _fmt = _build_config(data, "single")

    img = render_tweet(text, **cfg)
    png_buf = io.BytesIO()
    img.save(png_buf, format="PNG")

    pad_color = "white" if theme == "light" else "black"
    mp4_bytes = png_bytes_to_mp4_bytes(png_buf.getvalue(), pad_color=pad_color)
    return send_file(io.BytesIO(mp4_bytes), mimetype="video/mp4")


@app.route("/render-all", methods=["POST"])
def render_all():
    """Render all slides and return as a ZIP.

    For the "single" (9:16) format, each slide is exported as a 7s silent MP4
    instead of a PNG.
    """
    data = request.get_json()
    slides = data.get("slides", [])
    cfg, theme, fmt = _build_config(data, "carousel")

    as_video = fmt == "single"
    pad_color = "white" if theme == "light" else "black"

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, text in enumerate(slides):
            img = render_tweet(text, **cfg)
            img_buf = io.BytesIO()
            img.save(img_buf, format="PNG")
            if as_video:
                mp4_bytes = png_bytes_to_mp4_bytes(img_buf.getvalue(), pad_color=pad_color)
                zf.writestr(f"slide_{i+1}.mp4", mp4_bytes)
            else:
                zf.writestr(f"slide_{i+1}.png", img_buf.getvalue())

    zip_buf.seek(0)
    return send_file(zip_buf, mimetype="application/zip", as_attachment=True, download_name="slides.zip")


@app.route("/formats")
def list_formats():
    return jsonify(FORMATS)


@app.route("/profiles")
def list_profiles():
    """Return a UI-safe summary of profiles (no filesystem paths)."""
    return jsonify({
        "default": DEFAULT_PROFILE,
        "profiles": {
            pid: {"display_name": p["display_name"], "handle": p["handle"]}
            for pid, p in PROFILES.items()
        },
    })


@app.route("/pfp/<profile_id>")
def serve_pfp(profile_id):
    """Serve the PFP for a given profile so the UI can show a thumbnail."""
    profile = PROFILES.get(profile_id)
    if not profile:
        return ("Not found", 404)
    pfp_path = profile["pfp_path"]
    return send_from_directory(
        os.path.dirname(pfp_path),
        os.path.basename(pfp_path),
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5173, debug=True)
