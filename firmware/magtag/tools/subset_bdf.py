"""Keep only the glyphs a face uses, so a BDF fits the MagTag's 960 KB drive.

    python3 subset_bdf.py in.bdf out.bdf "0123456789:"

The full Roboto BDFs come from Adafruit's Learning System guides
(CLUE/Clue_Step_Counter/fonts); the repo keeps only these subsets.
"""
import sys

src, dst, keep = sys.argv[1], sys.argv[2], sys.argv[3]
wanted = {ord(c) for c in keep}
out, glyphs, buf, code, in_glyph = [], [], [], None, False
for line in open(src, encoding="latin-1"):
    if line.startswith("STARTCHAR"):
        in_glyph, buf, code = True, [line], None
    elif in_glyph:
        buf.append(line)
        if line.startswith("ENCODING"):
            code = int(line.split()[1])
        if line.startswith("ENDCHAR"):
            if code in wanted:
                glyphs.append("".join(buf))
            in_glyph = False
    elif line.startswith("CHARS "):
        out.append(None)  # placeholder, count goes here
    elif line.startswith("ENDFONT"):
        pass
    else:
        out.append(line)
with open(dst, "w", encoding="latin-1") as f:
    for line in out:
        f.write("CHARS %d\n" % len(glyphs) if line is None else line)
    f.write("".join(glyphs))
    f.write("ENDFONT\n")
print(dst, len(glyphs), "glyphs")
