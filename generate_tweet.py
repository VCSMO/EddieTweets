from PIL import Image, ImageDraw, ImageFont
import cairosvg
import io
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# --- CONFIG ---
WIDTH = 1080
HEIGHT = 1440
BG_COLOR = (0, 0, 0)
TEXT_COLOR = (231, 233, 234)
HANDLE_COLOR = (113, 118, 123)
PFP_SIZE = 120
PFP_PATH = os.path.join(BASE_DIR, "eddie-pfp.jpg")
OUTPUT_DIR = os.path.join(BASE_DIR, "slides")

# Chirp fonts (Twitter's actual font)
FONT_DIR = os.path.join(BASE_DIR, "fonts")
FONT_HEAVY = os.path.join(FONT_DIR, "chirp-heavy.ttf")      # 800 - for display name
FONT_BOLD = os.path.join(FONT_DIR, "chirp-bold.ttf")        # 700
FONT_MEDIUM = os.path.join(FONT_DIR, "chirp-medium.ttf")    # 500 - for tweet text
FONT_REGULAR = os.path.join(FONT_DIR, "chirp-regular.ttf")  # 400 - for handle

FONT_NAME_SIZE = 46
FONT_HANDLE_SIZE = 38
FONT_TWEET_SIZE = 50

# Exact Twitter verified badge - split into blue badge shape + white checkmark
BADGE_SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22" width="{size}" height="{size}">
  <path fill="#1D9BF0" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816z"/>
  <path fill="#FFFFFF" d="M9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/>
</svg>'''


def make_circle_pfp(path, size, zoom=1.18):
    """Crop into circle. zoom > 1 zooms in on the center (face)."""
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    # Crop centered, zoomed in
    crop_size = int(min(w, h) / zoom)
    left = (w - crop_size) // 2
    top = (h - crop_size) // 2
    # Bias crop slightly upward to keep face centered
    top = max(0, top - int(crop_size * 0.08))
    img = img.crop((left, top, left + crop_size, top + crop_size))
    img = img.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size, size), fill=255)
    img.putalpha(mask)
    return img


def render_verified_badge(size=24):
    """Render the exact Twitter verified badge SVG to a PIL image."""
    svg_str = BADGE_SVG.format(size=size * 4)  # Render at 4x for quality
    png_data = cairosvg.svg2png(bytestring=svg_str.encode(), output_width=size * 4, output_height=size * 4)
    badge = Image.open(io.BytesIO(png_data)).convert("RGBA")
    badge = badge.resize((size, size), Image.LANCZOS)  # Downscale with AA
    return badge


def wrap_text(text, font, max_width):
    """Word-wrap text to fit within max_width. Returns list of paragraph line-lists."""
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


def measure_text_block(paragraphs_lines, font, line_gap, para_gap):
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


def draw_tweet_slide(tweet_text, slide_number, total_slides, output_path):
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)

    font_name = ImageFont.truetype(FONT_HEAVY, FONT_NAME_SIZE)
    font_handle = ImageFont.truetype(FONT_REGULAR, FONT_HANDLE_SIZE)
    font_tweet = ImageFont.truetype(FONT_MEDIUM, FONT_TWEET_SIZE)

    x_left = 80
    max_text_w = WIDTH - (x_left * 2)
    line_gap = 18
    para_gap = 36

    # Wrap and measure
    para_lines = wrap_text(tweet_text, font_tweet, max_text_w)
    header_h = PFP_SIZE
    header_gap = 44
    text_h = measure_text_block(para_lines, font_tweet, line_gap, para_gap)
    total_content_h = header_h + header_gap + text_h
    start_y = (HEIGHT - total_content_h) // 2

    # --- Profile Header ---
    pfp_y = start_y
    # Draw PFP border ring
    border = 3
    pfp_total = PFP_SIZE + border * 2
    border_color = (80, 80, 80)
    draw.ellipse(
        (x_left - border, pfp_y - border,
         x_left + PFP_SIZE + border, pfp_y + PFP_SIZE + border),
        outline=border_color, width=2
    )
    pfp = make_circle_pfp(PFP_PATH, PFP_SIZE)
    img.paste(pfp, (x_left, pfp_y), pfp)

    name_x = x_left + PFP_SIZE + 24
    name_y = pfp_y + 6

    # Name (Bold 700)
    draw.text((name_x, name_y), "Eddie Maalouf", fill=TEXT_COLOR, font=font_name)
    name_bbox = font_name.getbbox("Eddie Maalouf")
    name_w = name_bbox[2] - name_bbox[0]

    # Verified badge - sized to match capital letter height
    name_h = name_bbox[3] - name_bbox[1]
    badge_size = int(name_h * 0.95)
    badge = render_verified_badge(badge_size)
    badge_x = name_x + name_w + 10
    # Center badge with the actual rendered text midpoint
    text_center_y = name_y + (name_bbox[1] + name_bbox[3]) // 2
    badge_y = text_center_y - badge_size // 2
    img.paste(badge, (badge_x, badge_y), badge)

    # Handle
    handle_y = name_y + (name_bbox[3] - name_bbox[1]) + 12
    draw.text((name_x, handle_y), "@imakeBADads", fill=HANDLE_COLOR, font=font_handle)

    # --- Tweet Text ---
    text_y = pfp_y + header_h + header_gap
    for pi, lines in enumerate(para_lines):
        for li, line in enumerate(lines):
            draw.text((x_left, text_y), line, fill=TEXT_COLOR, font=font_tweet)
            bbox = font_tweet.getbbox(line)
            text_y += (bbox[3] - bbox[1]) + line_gap
        if pi < len(para_lines) - 1:
            text_y += para_gap

    img.save(output_path, "PNG")
    print(f"Saved: {output_path}")


# --- GENERATE CAROUSEL ---
os.makedirs(OUTPUT_DIR, exist_ok=True)

slides = [
    # Card 1 - Hook
    """Delegating yourself out of your business requires the sudden death of your identity.""",

    # Card 2
    """You stop taking client calls.

You stop approving every creative.

You stop being the one people come to with problems.""",

    # Card 3
    """You hire someone better than you at the thing you were best at.

Now you're left wondering what you actually do now.

And when that feeling starts eating at you…""",

    # Card 4
    """Don't take it as a warning sign.

It's just a transition.""",

    # Card 5 - Close
    """The founders who never get past it stay "involved" forever.

The business doesn't need you to do the work.

It needs you to build the machine that does.""",
]

total = len(slides)
for i, text in enumerate(slides):
    num = i + 1
    draw_tweet_slide(text, num, total, os.path.join(OUTPUT_DIR, f"slide_{num}.png"))

print(f"Done! Generated {total} slides.")
