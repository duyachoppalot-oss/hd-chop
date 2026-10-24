#!/usr/bin/env python3
"""Generate HD Chop app icons and splash art into apps/mobile/assets.

Black and gold, old dealer parts-counter sign: "HD" in condensed sign lettering
over "CHOP", a gold rule between, a double gold frame. Lettering only -- no
H-D logos or bar & shield (DATA_RIGHTS.md trademark note).

  python3 apps/mobile/scripts/make-icons.py

Outputs (1024 px unless noted):
  icon.png                      iOS icon, opaque (App Store rejects alpha)
  splash-icon.png               transparent lockup for expo-splash-screen
  android-icon-foreground.png   transparent lockup inside the adaptive-icon safe zone
  android-icon-background.png   solid background
  android-icon-monochrome.png   white lockup for themed icons
  favicon.png                   48 px
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
FONTS = HERE.parent / "node_modules" / "@expo-google-fonts" / "oswald"
BOLD = FONTS / "700Bold" / "Oswald_700Bold.ttf"
SEMI = FONTS / "600SemiBold" / "Oswald_600SemiBold.ttf"

BG = (11, 10, 8)          # theme color.bg  #0B0A08
GOLD = (212, 165, 44)     # theme color.gold #D4A52C
GOLD_DIM = (140, 109, 31) # theme color.goldDim
CREAM = (242, 232, 208)   # theme color.cream
S = 1024


def text_w(draw, text, font, spacing=0):
    w = 0
    for ch in text:
        w += draw.textlength(ch, font=font) + spacing
    return w - spacing


def draw_spaced(draw, x, y, text, font, fill, spacing=0):
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + spacing


def lockup(size, color, scale=1.0):
    """Transparent 'HD / rule / CHOP' lockup centred on a size x size canvas."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    hd = ImageFont.truetype(str(BOLD), int(470 * scale))
    chop = ImageFont.truetype(str(SEMI), int(150 * scale))
    sp = int(34 * scale)

    hd_box = d.textbbox((0, 0), "HD", font=hd)
    hd_w, hd_h = hd_box[2] - hd_box[0], hd_box[3] - hd_box[1]
    ch_box = d.textbbox((0, 0), "CHOP", font=chop)
    ch_h = ch_box[3] - ch_box[1]
    ch_w = text_w(d, "CHOP", chop, sp)
    gap = int(34 * scale)
    rule_h = max(2, int(12 * scale))
    total = hd_h + gap + rule_h + gap + ch_h
    top = (size - total) / 2

    d.text(((size - hd_w) / 2 - hd_box[0], top - hd_box[1]), "HD", font=hd, fill=color)
    ry = top + hd_h + gap
    rw = max(hd_w, ch_w)
    d.rectangle([(size - rw) / 2, ry, (size + rw) / 2, ry + rule_h], fill=color)
    cy = ry + rule_h + gap
    draw_spaced(d, (size - ch_w) / 2 - ch_box[0], cy - ch_box[1], "CHOP", chop, color, sp)
    return img


def frame(draw, inset, width, color, radius):
    draw.rounded_rectangle([inset, inset, S - inset, S - inset], radius=radius, outline=color, width=width)


def main():
    ASSETS.mkdir(exist_ok=True)

    # iOS icon: opaque, double frame like an enamel counter sign.
    icon = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(icon)
    frame(d, 70, 14, GOLD, 120)
    frame(d, 104, 4, GOLD_DIM, 92)
    mark = lockup(S, GOLD, scale=0.82)
    icon.paste(mark, (0, 0), mark)
    icon.save(ASSETS / "icon.png")

    # Splash: lockup only; expo-splash-screen centres it on the background color.
    lockup(S, GOLD, scale=1.0).save(ASSETS / "splash-icon.png")

    # Android adaptive: foreground inside the 66% safe zone, solid background, mono.
    lockup(S, GOLD, scale=0.6).save(ASSETS / "android-icon-foreground.png")
    Image.new("RGB", (S, S), BG).save(ASSETS / "android-icon-background.png")
    lockup(S, (255, 255, 255), scale=0.6).save(ASSETS / "android-icon-monochrome.png")

    # Favicon: the icon scaled down.
    icon.resize((48, 48), Image.LANCZOS).save(ASSETS / "favicon.png")
    print("wrote", ", ".join(p.name for p in sorted(ASSETS.glob("*.png"))))


if __name__ == "__main__":
    main()
