"""Flask app for generating tweet carousel slides."""
from flask import Flask, render_template, request, send_file, jsonify, send_from_directory
from tweet_render import render_tweet, FORMATS, png_bytes_to_mp4_bytes
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


@app.route("/render", methods=["POST"])
def render_single():
    """Render a single slide and return PNG bytes."""
    data = request.get_json()
    text = data.get("text", "")
    fmt = data.get("format", "carousel")
    overrides = data.get("overrides", {}) or {}

    cfg = FORMATS.get(fmt, FORMATS["carousel"]).copy()
    cfg.update({k: v for k, v in overrides.items() if v is not None})

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
    fmt = data.get("format", "single")
    overrides = data.get("overrides", {}) or {}

    cfg = FORMATS.get(fmt, FORMATS["single"]).copy()
    cfg.update({k: v for k, v in overrides.items() if v is not None})

    img = render_tweet(text, **cfg)
    png_buf = io.BytesIO()
    img.save(png_buf, format="PNG")

    mp4_bytes = png_bytes_to_mp4_bytes(png_buf.getvalue())
    return send_file(io.BytesIO(mp4_bytes), mimetype="video/mp4")


@app.route("/render-all", methods=["POST"])
def render_all():
    """Render all slides and return as a ZIP.

    For the "single" (9:16) format, each slide is exported as a 7s silent MP4
    instead of a PNG.
    """
    data = request.get_json()
    slides = data.get("slides", [])
    fmt = data.get("format", "carousel")
    overrides = data.get("overrides", {}) or {}

    cfg = FORMATS.get(fmt, FORMATS["carousel"]).copy()
    cfg.update({k: v for k, v in overrides.items() if v is not None})

    as_video = fmt == "single"

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, text in enumerate(slides):
            img = render_tweet(text, **cfg)
            img_buf = io.BytesIO()
            img.save(img_buf, format="PNG")
            if as_video:
                mp4_bytes = png_bytes_to_mp4_bytes(img_buf.getvalue())
                zf.writestr(f"slide_{i+1}.mp4", mp4_bytes)
            else:
                zf.writestr(f"slide_{i+1}.png", img_buf.getvalue())

    zip_buf.seek(0)
    return send_file(zip_buf, mimetype="application/zip", as_attachment=True, download_name="slides.zip")


@app.route("/formats")
def list_formats():
    return jsonify(FORMATS)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5173, debug=True)
