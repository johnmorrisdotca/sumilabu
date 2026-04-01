from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

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


def main():
    ui_big_chars = "".join(sorted(set("VancouverTokyo")))
    # Keep hierarchy: headers medium, time very large, date compact.
    font_ui_big = build_font(ui_big_chars, ARIAL_BOLD, size=32, stroke=1)

    # Shared JP glyph map is much lighter than storing full phrase bitmaps.
    jp_chars = "".join(sorted(set("バンクーバー東京月火水木金土日曜日")))
    font_jp = build_font(jp_chars, ARIAL_UNICODE, size=30, stroke=0)

    font_time = build_font("0123456789:", ARIAL_BOLD, size=90, stroke=1)
    font_date = build_font("0123456789/-年月日", ARIAL_UNICODE, size=22, stroke=0)

    out = []
    out.append('"""Generated custom bitmap assets for InkyFrame text rendering."""')
    out.append("")

    emit_dict("FONT_UI_BIG", font_ui_big, out)
    emit_dict("FONT_JP", font_jp, out)
    emit_dict("FONT_TIME", font_time, out)
    emit_dict("FONT_DATE", font_date, out)

    Path("custom_bitmaps.py").write_text("\n".join(out), encoding="utf-8")
    print("WROTE custom_bitmaps.py")


if __name__ == "__main__":
    main()
