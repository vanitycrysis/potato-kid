"""Converts Codex's launcher and splash masters (art/exports/android, ASSETS.md) into
Android resources. Claude owns this native conversion; the masters stay ChatGPT's.
Requires Pillow. Run from the repo root:  python scripts/android-res.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

SRC = Path('art/exports/android')
RES = Path('android/app/src/main/res')
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

fg = Image.open(SRC / 'android_launcher_foreground.png').convert('RGBA')
mono = Image.open(SRC / 'android_launcher_foreground_monochrome.png').convert('RGBA')
bg = Image.open(SRC / 'android_launcher_background.png').convert('RGBA')
splash = Image.open(SRC / 'android_splash_logo.png').convert('RGBA')


def save(img: Image.Image, folder: str, name: str, px: int) -> None:
    out = RES / folder / name
    out.parent.mkdir(parents=True, exist_ok=True)
    img.resize((px, px), Image.LANCZOS).save(out, optimize=True)


# Legacy launcher (pre-adaptive launchers): the composite's central 72 dp of 108 dp, the
# area every adaptive mask keeps, as a square and as a circle.
composite = Image.alpha_composite(bg, fg)
side = composite.width
crop = composite.crop((side // 6, side // 6, side - side // 6, side - side // 6))
mask = Image.new('L', crop.size, 0)
ImageDraw.Draw(mask).ellipse((0, 0, crop.width - 1, crop.height - 1), fill=255)
round_icon = Image.new('RGBA', crop.size, (0, 0, 0, 0))
round_icon.paste(crop, (0, 0), mask)

for d, k in DENSITIES.items():
    folder = f'mipmap-{d}'
    # Adaptive layers: a 108 dp canvas.
    save(fg, folder, 'ic_launcher_foreground.png', round(108 * k))
    save(mono, folder, 'ic_launcher_monochrome.png', round(108 * k))
    # Legacy icons: 48 dp.
    save(crop, folder, 'ic_launcher.png', round(48 * k))
    save(round_icon, folder, 'ic_launcher_round.png', round(48 * k))
    # Android 12+ splash icon: a 288 dp canvas whose mark stays inside the central 192 dp
    # circle, matching Codex's 1152 px master with its 768 px safe circle.
    save(splash, f'drawable-{d}', 'splash_logo.png', round(288 * k))

print('ok')
