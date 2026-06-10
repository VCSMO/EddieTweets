"""Reusable tweet rendering module. Can produce PNGs at any aspect ratio."""
from PIL import Image, ImageDraw, ImageFont
import io
import os
import re
import subprocess
import tempfile

# Video export settings for the "single" (9:16) format
VIDEO_DURATION_SEC = 7
VIDEO_WIDTH = 1080
VIDEO_HEIGHT = 1920


def png_bytes_to_mp4_bytes(png_bytes, duration=VIDEO_DURATION_SEC,
                           width=VIDEO_WIDTH, height=VIDEO_HEIGHT,
                           pad_color="black"):
    """Loop a static PNG into a silent MP4 of the given duration.

    Uses ffmpeg. Output is H.264, yuv420p, no audio track. Pads/letterboxes
    if the source PNG doesn't match the target dimensions.
    """
    with tempfile.TemporaryDirectory() as td:
        png_path = os.path.join(td, "frame.png")
        mp4_path = os.path.join(td, "out.mp4")
        with open(png_path, "wb") as f:
            f.write(png_bytes)

        vf = (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color={pad_color},"
            "setsar=1,format=yuv420p"
        )
        cmd = [
            "ffmpeg", "-y",
            "-loop", "1",
            "-framerate", "30",
            "-t", str(duration),
            "-i", png_path,
            "-vf", vf,
            "-c:v", "libx264",
            "-preset", "medium",
            "-movflags", "+faststart",
            "-an",
            mp4_path,
        ]
        proc = subprocess.run(cmd, capture_output=True, check=False)
        if proc.returncode != 0:
            raise RuntimeError(
                "ffmpeg failed "
                f"(code {proc.returncode}): "
                f"{proc.stderr.decode(errors='replace')[-500:]}"
            )
        with open(mp4_path, "rb") as f:
            return f.read()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Profiles: map of profile_id -> {display_name, handle, pfp_path, pfp_zoom?}
# pfp_zoom is optional per profile and overrides the default crop zoom — set
# to 1.0 to use the full source image (useful when the image is already a
# composed square).
PROFILES = {
    "eddie": {
        "display_name": "Eddie Maalouf",
        "handle": "@imakeBADads",
        "pfp_path": os.path.join(BASE_DIR, "eddie-pfp.jpg"),
    },
}
DEFAULT_PROFILE = "eddie"

# Backwards compatibility
DEFAULT_PFP_PATH = PROFILES[DEFAULT_PROFILE]["pfp_path"]
DEFAULT_DISPLAY_NAME = PROFILES[DEFAULT_PROFILE]["display_name"]
DEFAULT_HANDLE = PROFILES[DEFAULT_PROFILE]["handle"]

# Theme palettes matching Twitter/X colors
THEMES = {
    "dark": {
        "bg": (0, 0, 0),
        "text": (231, 233, 234),
        "handle": (113, 118, 123),
        "border": (80, 80, 80),
    },
    "light": {
        "bg": (255, 255, 255),
        "text": (15, 20, 25),
        "handle": (83, 100, 113),
        "border": (207, 217, 222),
    },
}

# Backwards compatibility
TEXT_COLOR = THEMES["dark"]["text"]
HANDLE_COLOR = THEMES["dark"]["handle"]
BG_COLOR = THEMES["dark"]["bg"]

# Fonts (Twitter Chirp)
FONT_DIR = os.path.join(BASE_DIR, "fonts")
FONT_HEAVY = os.path.join(FONT_DIR, "chirp-heavy.ttf")
FONT_BOLD = os.path.join(FONT_DIR, "chirp-bold.ttf")
FONT_MEDIUM = os.path.join(FONT_DIR, "chirp-medium.ttf")
FONT_REGULAR = os.path.join(FONT_DIR, "chirp-regular.ttf")

BADGE_SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" width="{size}" height="{size}">
  <path fill="#1D9BF0" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816z"/>
  <path fill="#FFFFFF" d="M9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/>
</svg>'''


def make_circle_pfp(path, size, zoom=1.18):
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    crop_size = int(min(w, h) / zoom)
    left = (w - crop_size) // 2
    top = (h - crop_size) // 2
    top = max(0, top - int(crop_size * 0.08))
    img = img.crop((left, top, left + crop_size, top + crop_size))
    img = img.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size, size), fill=255)
    img.putalpha(mask)
    return img


def render_verified_badge(size=24):
    import cairosvg  # lazy: libcairo may not be installed in dev envs that only need bad_carousel
    svg_str = BADGE_SVG.format(size=size * 4)
    png_data = cairosvg.svg2png(bytestring=svg_str.encode(), output_width=size * 4, output_height=size * 4)
    badge = Image.open(io.BytesIO(png_data)).convert("RGBA")
    badge = badge.resize((size, size), Image.LANCZOS)
    return badge


def wrap_text(text, font, max_width):
    """Legacy plain-text word wrap. Kept for backwards compat; styled rendering
    goes through wrap_styled below."""
    paragraphs = text.strip().split("\n\n")
    result = []
    for para in paragraphs:
        words = para.split()
        lines = []
        current = ""
        for word in words:
            test = f"{current} {word}".strip()
            bbox = font.getbbox(test)
            if bbox[2] - bbox[0] <= max_width:
                current = test
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
        result.append(lines)
    return result


# --- Inline markdown (bold / italic / both) -----------------------------------

# Matches ***x*** then **x** then *x*. Each must wrap non-whitespace content
# (so "5 * 6" or trailing asterisks don't accidentally activate formatting),
# and cannot span newlines.
_BOLD_ITALIC_RE = re.compile(r"\*\*\*(\S(?:[^*\n]*?\S)?)\*\*\*")
_BOLD_RE        = re.compile(r"\*\*(\S(?:[^*\n]*?\S)?)\*\*")
_ITALIC_RE      = re.compile(r"\*(\S(?:[^*\n]*?\S)?)\*")


def parse_inline_markdown(text):
    """Parse a string of text with inline **bold**, *italic*, ***both*** markers.

    Returns a list of (text_segment, bold, italic) tuples in source order.
    """
    # Find spans, longest-first, marking used positions so we don't double-claim.
    spans = []  # (start, end, content, bold, italic)
    used = [False] * len(text)

    def claim(m, bold, italic):
        s, e = m.span()
        if any(used[s:e]):
            return False
        for i in range(s, e):
            used[i] = True
        spans.append((s, e, m.group(1), bold, italic))
        return True

    for m in _BOLD_ITALIC_RE.finditer(text):
        claim(m, True, True)
    for m in _BOLD_RE.finditer(text):
        claim(m, True, False)
    for m in _ITALIC_RE.finditer(text):
        claim(m, False, True)

    spans.sort()

    out = []
    last_end = 0
    for s, e, content, bold, italic in spans:
        if s > last_end:
            out.append((text[last_end:s], False, False))
        out.append((content, bold, italic))
        last_end = e
    if last_end < len(text):
        out.append((text[last_end:], False, False))

    if not out:
        out.append((text, False, False))
    return out


def _font_for(fonts, bold, italic):
    """Pick which font weight to use for a styled span.

    Italics are synthesized via shear at draw time — we still pick a weight
    here so wrapping/measurement match what gets drawn.
    """
    if bold:
        return fonts["bold"]
    return fonts["regular"]


def _tokenize_run(text, bold, italic):
    """Split a single styled span into word/space atoms while preserving spacing."""
    if not text:
        return []
    atoms = []
    # re.split keeps the separators when the pattern is captured
    for piece in re.split(r"(\s+)", text):
        if piece == "":
            continue
        atoms.append({
            "text": piece,
            "bold": bold,
            "italic": italic,
            "is_space": piece.isspace(),
        })
    return atoms


def wrap_styled(text, fonts, max_width):
    """Wrap markdown-styled text into a paragraph/row/line tree.

    Returns ``paragraphs[paragraph_idx][row_idx][line_idx]`` where each line
    is a list of run dicts ``{"text", "bold", "italic"}``. Three vertical
    gap sizes are recognised downstream:

      * "\\n\\n"  → paragraph break (para_gap, largest)
      * "\\n"    → row break (row_gap, between bullets / Enter-once lines)
      * wrap    → line break inside a row (line_gap, tightest)
    """
    paragraphs = text.strip().split("\n\n")
    out_paragraphs = []
    for para in paragraphs:
        rows = para.split("\n")
        out_rows = []
        for row in rows:
            atoms = []
            for seg_text, bold, italic in parse_inline_markdown(row):
                atoms.extend(_tokenize_run(seg_text, bold, italic))

            lines = [[]]
            line_w = 0
            for atom in atoms:
                font = _font_for(fonts, atom["bold"], atom["italic"])
                bbox = font.getbbox(atom["text"])
                atom_w = bbox[2] - bbox[0]

                if not atom["is_space"] and line_w + atom_w > max_width and lines[-1]:
                    while lines[-1] and lines[-1][-1]["is_space"]:
                        line_w -= _font_for(fonts, lines[-1][-1]["bold"], lines[-1][-1]["italic"]).getbbox(lines[-1][-1]["text"])[2]
                        lines[-1].pop()
                    lines.append([])
                    line_w = 0

                if atom["is_space"] and not lines[-1]:
                    continue

                lines[-1].append(atom)
                line_w += atom_w

            for line in lines:
                while line and line[-1]["is_space"]:
                    line.pop()
            lines = [ln for ln in lines if ln]
            if not lines:
                lines = [[]]  # preserve blank rows

            # Coalesce adjacent same-style atoms within each line
            coalesced_row = []
            for line in lines:
                coalesced = []
                for atom in line:
                    if coalesced and coalesced[-1]["bold"] == atom["bold"] and coalesced[-1]["italic"] == atom["italic"]:
                        coalesced[-1]["text"] += atom["text"]
                    else:
                        coalesced.append({
                            "text": atom["text"],
                            "bold": atom["bold"],
                            "italic": atom["italic"],
                        })
                coalesced_row.append(coalesced)
            out_rows.append(coalesced_row)

        if not out_rows:
            out_rows = [[[]]]
        out_paragraphs.append(out_rows)
    return out_paragraphs


def measure_styled_block(paragraphs, fonts, line_gap, para_gap, row_gap=None):
    """Total pixel height of a wrapped styled block.

    Three vertical gaps:
      * line_gap : between word-wrapped lines inside a single row
      * row_gap  : between hard-broken rows in the same paragraph (defaults
                   to line_gap if not provided, for backwards compat)
      * para_gap : between paragraphs (blank-line separated)
    """
    if row_gap is None:
        row_gap = line_gap
    base = fonts["regular"]
    ascent, descent = base.getmetrics()
    line_h = ascent + descent

    total = 0
    for pi, rows in enumerate(paragraphs):
        for ri, lines in enumerate(rows):
            n = len(lines) if lines else 1
            total += line_h * n + line_gap * max(0, n - 1)
            if ri < len(rows) - 1:
                total += row_gap
        if pi < len(paragraphs) - 1:
            total += para_gap
    return total


def _draw_italic_run(image, xy, text, font, fill, skew=0.18):
    """Render a single text run with synthesized italic via shear transform.

    Returns the advance width (same as the upright font's width)."""
    bbox = font.getbbox(text)
    text_w = bbox[2] - bbox[0]
    ascent, descent = font.getmetrics()
    line_h = ascent + descent
    pad = int(line_h * skew) + 4  # space for shear overflow

    layer_w = text_w + pad * 2
    layer_h = line_h + 4
    layer = Image.new("RGBA", (layer_w, layer_h), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    # Draw text at left edge of padded layer, aligned to top of font box
    ld.text((pad - bbox[0], 0), text, font=font, fill=fill)

    # Shear: top of letter leans right by `pad`. PIL AFFINE is inverse:
    # destination (dx, dy) reads from source (a*dx + b*dy + c, d*dx + e*dy + f).
    # Forward T: (sx, sy) -> (sx + skew*(layer_h - sy), sy)
    # Inverse:    (dx, dy) -> (dx - skew*(layer_h - dy), dy)
    skewed = layer.transform(
        layer.size,
        Image.AFFINE,
        (1, skew, -skew * layer_h, 0, 1, 0),
        resample=Image.BICUBIC,
    )
    image.paste(skewed, (int(xy[0]) - pad, int(xy[1])), skewed)
    return text_w


def draw_styled_run(image, xy, run, fonts, fill):
    """Draw a single styled run. Returns advance width."""
    font = _font_for(fonts, run["bold"], run["italic"])
    if run["italic"]:
        return _draw_italic_run(image, xy, run["text"], font, fill)
    draw = ImageDraw.Draw(image)
    draw.text(xy, run["text"], font=font, fill=fill)
    bbox = font.getbbox(run["text"])
    return bbox[2] - bbox[0]


def measure_text_block(paragraphs_lines, font, line_gap, para_gap):
    """Legacy plain-text measure (kept for callers using wrap_text)."""
    total = 0
    for pi, lines in enumerate(paragraphs_lines):
        for li, line in enumerate(lines):
            bbox = font.getbbox(line)
            total += bbox[3] - bbox[1]
            if li < len(lines) - 1:
                total += line_gap
        if pi < len(paragraphs_lines) - 1:
            total += para_gap
    return total


def render_tweet(
    tweet_text,
    width=1080,
    height=1440,
    profile=None,
    pfp_path=None,
    display_name=None,
    handle=None,
    pfp_size=120,
    font_name_size=46,
    font_handle_size=38,
    font_tweet_size=50,
    pfp_zoom=None,
    x_padding=80,
    header_gap=44,
    handle_gap=12,
    line_gap=18,
    row_gap=32,
    para_gap=42,
    badge_scale=0.95,
    theme="dark",
):
    """Render a tweet to a PIL Image at the given dimensions.

    Profile resolution order (per field):
      1. explicit pfp_path / display_name / handle kwarg (if provided)
      2. PROFILES[profile] entry (if profile id is given and valid)
      3. PROFILES[DEFAULT_PROFILE] (Eddie)
    """
    profile_data = PROFILES.get(profile) if profile else None
    if profile_data is None:
        profile_data = PROFILES[DEFAULT_PROFILE]
    pfp_path = pfp_path or profile_data["pfp_path"]
    display_name = display_name if display_name is not None else profile_data["display_name"]
    handle = handle if handle is not None else profile_data["handle"]
    if pfp_zoom is None:
        pfp_zoom = profile_data.get("pfp_zoom", 1.18)
    palette = THEMES.get(theme, THEMES["dark"])
    bg_color = palette["bg"]
    text_color = palette["text"]
    handle_color = palette["handle"]
    border_color = palette["border"]

    img = Image.new("RGB", (width, height), bg_color)
    draw = ImageDraw.Draw(img)

    font_name = ImageFont.truetype(FONT_HEAVY, font_name_size)
    font_handle = ImageFont.truetype(FONT_REGULAR, font_handle_size)
    # Tweet body uses Medium for regular runs and Bold for **bold** runs.
    # Italic is synthesized via shear at draw time using the same weight.
    tweet_fonts = {
        "regular": ImageFont.truetype(FONT_MEDIUM, font_tweet_size),
        "bold":    ImageFont.truetype(FONT_BOLD, font_tweet_size),
    }
    font_tweet = tweet_fonts["regular"]

    max_text_w = width - (x_padding * 2)

    para_styled = wrap_styled(tweet_text, tweet_fonts, max_text_w)
    text_h = measure_styled_block(para_styled, tweet_fonts, line_gap, para_gap, row_gap)

    name_bbox = font_name.getbbox(display_name)
    name_h = name_bbox[3] - name_bbox[1]
    handle_bbox = font_handle.getbbox(handle)
    handle_h = handle_bbox[3] - handle_bbox[1]

    # Header height = max(pfp, name + gap + handle)
    header_text_h = name_h + handle_gap + handle_h
    header_h = max(pfp_size, header_text_h)

    total_content_h = header_h + header_gap + text_h
    start_y = (height - total_content_h) // 2

    # --- Profile Header ---
    pfp_y = start_y + (header_h - pfp_size) // 2
    # Border ring
    border = 3
    draw.ellipse(
        (x_padding - border, pfp_y - border,
         x_padding + pfp_size + border, pfp_y + pfp_size + border),
        outline=border_color, width=2
    )
    pfp = make_circle_pfp(pfp_path, pfp_size, zoom=pfp_zoom)
    img.paste(pfp, (x_padding, pfp_y), pfp)

    name_x = x_padding + pfp_size + 24
    # Vertically center the name+handle block with the PFP
    text_block_start_y = start_y + (header_h - header_text_h) // 2
    name_y = text_block_start_y - name_bbox[1]  # Correct for font baseline

    # Name
    draw.text((name_x, name_y), display_name, fill=text_color, font=font_name)
    name_w = name_bbox[2] - name_bbox[0]

    # Verified badge
    badge_size = int(name_h * badge_scale)
    badge = render_verified_badge(badge_size)
    badge_x = name_x + name_w + 10
    text_center_y = name_y + (name_bbox[1] + name_bbox[3]) // 2
    badge_y = text_center_y - badge_size // 2
    img.paste(badge, (badge_x, badge_y), badge)

    # Handle
    handle_y = text_block_start_y + name_h + handle_gap - handle_bbox[1]
    draw.text((name_x, handle_y), handle, fill=handle_color, font=font_handle)

    # --- Tweet Text (styled runs: **bold**, *italic*, ***both***) ---
    # 3-level structure: paragraphs → rows → wrapped lines → runs
    #   line_gap : between word-wrapped lines inside a single row
    #   row_gap  : between hard-broken rows (Enter once) in the same paragraph
    #   para_gap : between paragraphs (blank line / Enter twice)
    text_y = start_y + header_h + header_gap
    base_font = tweet_fonts["regular"]
    ascent, descent = base_font.getmetrics()
    line_h = ascent + descent
    for pi, rows in enumerate(para_styled):
        for ri, lines in enumerate(rows):
            if not lines:
                text_y += line_h
            else:
                for li, line_runs in enumerate(lines):
                    x = x_padding
                    for run in line_runs:
                        advance = draw_styled_run(img, (x, text_y), run, tweet_fonts, text_color)
                        x += advance
                    text_y += line_h
                    if li < len(lines) - 1:
                        text_y += line_gap
            if ri < len(rows) - 1:
                text_y += row_gap
        if pi < len(para_styled) - 1:
            text_y += para_gap

    return img


# Preset format configurations
FORMATS = {
    "carousel": {
        "width": 1080,
        "height": 1440,
        "pfp_size": 120,
        "font_name_size": 46,
        "font_handle_size": 38,
        "font_tweet_size": 50,
    },
    "single": {
        "width": 1080,
        "height": 1920,
        "pfp_size": 130,
        "font_name_size": 50,
        "font_handle_size": 42,
        "font_tweet_size": 56,
    },
}
