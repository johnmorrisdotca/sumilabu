from pathlib import Path
import importlib.util
import os

from PIL import Image, ImageDraw, ImageFont

FIRMWARE_DIR = Path(__file__).resolve().parent.parent
SECRETS_PATH = FIRMWARE_DIR / "secrets.py"


def load_local_secrets():
    if not SECRETS_PATH.exists():
        return None

    try:
        spec = importlib.util.spec_from_file_location("sumilabu_firmware_secrets", SECRETS_PATH)
        if spec is None or spec.loader is None:
            return None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    except Exception:
        return None


local_secrets = load_local_secrets()

ARIAL_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
ARIAL_UNICODE = "/Library/Fonts/Arial Unicode.ttf"


def render_bitmap(text, font_path, size, stroke=0, pad=2):
    font = ImageFont.truetype(font_path, size)
    img = Image.new("1", (1024, 256), 0)
    dr = ImageDraw.Draw(img)
    dr.text((4, 4), text, font=font, fill=1, stroke_width=stroke, stroke_fill=1)
    bbox = img.getbbox() or (0, 0, 1, 1)
    crop = img.crop(bbox)

    out = Image.new("1", (crop.width + pad * 2, crop.height + pad * 2), 0)
    out.paste(crop, (pad, pad))

    px = out.load()
    rows = []
    for y in range(out.height):
        rows.append("".join("#" if px[x, y] else "." for x in range(out.width)))

    return {"w": out.width, "h": out.height, "rows": rows}


def build_font(chars, font_path, size, stroke):
    return {ch: render_bitmap(ch, font_path, size=size, stroke=stroke, pad=1) for ch in chars}


def emit_dict(name, data, out_lines):
    out_lines.append(f"{name} = {{")
    for key, item in data.items():
        out_lines.append(f"    {key!r}: {{")
        out_lines.append(f"        'w': {item['w']},")
        out_lines.append(f"        'h': {item['h']},")
        out_lines.append("        'rows': [")
        for r in item["rows"]:
            out_lines.append(f"            {r!r},")
        out_lines.append("        ],")
        out_lines.append("    },")
    out_lines.append("}")
    out_lines.append("")


def cfg(name, default):
    val = os.getenv(name)
    if val is not None and val != "":
        return val
    if local_secrets and hasattr(local_secrets, name):
        return getattr(local_secrets, name)
    return default


def main():
    local_city_name = str(cfg("LOCAL_CITY_NAME", "VANCOUVER")).upper()
    remote_city_name = str(cfg("REMOTE_CITY_NAME", "TOKYO")).upper()
    local_city_name_jp = str(cfg("LOCAL_CITY_NAME_JP", "バンクーバー"))
    remote_city_name_jp = str(cfg("REMOTE_CITY_NAME_JP", "東京"))

    ui_big_chars = "".join(
        sorted(
            set(
                local_city_name
                + remote_city_name
                + "MONDAYTUESDAYWEDNESDAYTHURSDAYFRIDAYSATURDAYSUNDAYOVERLAPHELPER"
            )
        )
    )
    # Keep hierarchy: headers medium, time very large, date compact.
    font_ui_big = build_font(ui_big_chars, ARIAL_BOLD, size=34, stroke=1)

    # Shared JP glyph map is much lighter than storing full phrase bitmaps.
    jp_chars = "".join(sorted(set(local_city_name_jp + remote_city_name_jp + "月火水木金土日曜日")))
    font_jp = build_font(jp_chars, ARIAL_UNICODE, size=32, stroke=0)

    font_time = build_font("0123456789:", ARIAL_BOLD, size=90, stroke=1)
    font_date = build_font("0123456789/-年月日", ARIAL_UNICODE, size=22, stroke=0)

    out = []
    out.append('"""Generated custom bitmap assets for InkyFrame text rendering."""')
    out.append("")

    emit_dict("FONT_UI_BIG", font_ui_big, out)
    emit_dict("FONT_JP", font_jp, out)
    emit_dict("FONT_TIME", font_time, out)
    emit_dict("FONT_DATE", font_date, out)

    (FIRMWARE_DIR / "custom_bitmaps.py").write_text("\n".join(out), encoding="utf-8")
    print("WROTE custom_bitmaps.py")


if __name__ == "__main__":
    main()
