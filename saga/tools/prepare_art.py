"""Prepare the painted playfield for the game (run once; outputs go to saga/art/).

Input : the concept painting (iPhone 13 Pro Max screenshot, 1284x2778, art in rows 240..2520).
Output: playfield.jpg  - the painting with baked-in UI text, gibberish sign letters and the painted
                          flippers removed (texture-aware inpainting), so live elements can sit on top
        flipper-l.png / flipper-r.png - the painted flippers cut out with alpha (used as live sprites)
        btn-pause.png / btn-camera.png - the round purple buttons cut from the second concept image
        ext-top.jpg / ext-bottom.jpg   - painted extensions that fill the screen above/below the art

Usage: python3 prepare_art.py <base.png> <buttons.png> <outdir>
"""
import sys
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter

base_src, btn_src, out = sys.argv[1], sys.argv[2], sys.argv[3]
TOP, BOTTOM = 240, 2521  # painted area inside the screenshot

art = np.array(Image.open(base_src).convert('RGB'))[TOP:BOTTOM]
H, W = art.shape[:2]

# ---- painted flippers: cut out as sprites before removing them
FLIPPER_L = [(352, 1928), (372, 1908), (402, 1914), (572, 2040), (566, 2074), (538, 2084), (514, 2076)]
FLIPPER_R = [(928, 1928), (908, 1908), (878, 1914), (708, 2040), (714, 2074), (742, 2084), (766, 2076)]


def cut_sprite(poly, name):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(1.2))
    rgba = Image.fromarray(art).convert('RGBA')
    rgba.putalpha(m)
    xs, ys = [p[0] for p in poly], [p[1] for p in poly]
    box = (min(xs) - 4, min(ys) - 4, max(xs) + 4, max(ys) + 4)
    rgba.crop(box).save(f'{out}/{name}.png', optimize=True)
    return box


boxes = {'flipper-l': cut_sprite(FLIPPER_L, 'flipper-l'), 'flipper-r': cut_sprite(FLIPPER_R, 'flipper-r')}

# ---- inpaint: only the pixels that belong to baked-in text / painted flippers
bgr = cv2.cvtColor(art, cv2.COLOR_RGB2BGR)
hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
V, S = hsv[..., 2].astype(int), hsv[..., 1].astype(int)


def text_mask(rect, vmin=150, extra=None, grow_px=7):
    """Bright (gold / cream / pale blue) lettering inside rect, grown a little to catch the glow."""
    x0, y0, x1, y1 = rect
    m = np.zeros((H, W), np.uint8)
    sub = (V[y0:y1, x0:x1] >= vmin)
    if extra is not None:
        sub |= extra(hsv[y0:y1, x0:x1])
    m[y0:y1, x0:x1] = sub.astype(np.uint8) * 255
    return cv2.dilate(m, np.ones((grow_px, grow_px), np.uint8))


m = np.zeros((H, W), np.uint8)
for r, vmin, g in [((594, 180, 692, 296), 90, 11),   # score "0" (with its glow)
                   ((332, 336, 362, 382), 110, 7),   # Ball value
                   ((732, 336, 818, 382), 110, 7),   # multiplier value
                   ((1046, 336, 1084, 382), 100, 7), # Guests value
                   ((250, 2150, 1036, 2254), 150, 17),  # TAP FLIPPERS TO PLAY (+ its dark outline)
                   ((1052, 2160, 1266, 2256), 150, 15), # TOUCH TO LAUNCH
                   ((1034, 2010, 1164, 2168), 150, 15)]: # its arrow
    m |= text_mask(r, vmin, grow_px=g)
fl = Image.new('L', (W, H), 0)
grow = lambda poly, k: [(x + (x - sum(p[0] for p in poly) / len(poly)) * k, y + (y - sum(p[1] for p in poly) / len(poly)) * k) for x, y in poly]
ImageDraw.Draw(fl).polygon(grow(FLIPPER_L, 0.14), fill=255)
ImageDraw.Draw(fl).polygon(grow(FLIPPER_R, 0.14), fill=255)
fl = np.array(fl)

clean = bgr.copy()
cv2.xphoto.inpaint(bgr, 255 - m, clean, cv2.xphoto.INPAINT_FSR_FAST)  # xphoto: 0 = missing
# under the painted flippers: transplant real forest-floor texture from the open ground between the
# slingshots (Poisson / seamless cloning matches it to the surrounding light) instead of smearing colours
src_patch = clean[1760:1960, 520:760].copy()
for poly, flip in [(FLIPPER_L, False), (FLIPPER_R, True)]:
    pm8 = Image.new('L', (W, H), 0)
    ImageDraw.Draw(pm8).polygon(grow(poly, 0.16), fill=255)
    pm8 = np.array(pm8)
    ys, xs = np.nonzero(pm8)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    pw, ph = x1 - x0 + 1, y1 - y0 + 1
    patch = src_patch[:, ::-1] if flip else src_patch
    patch = cv2.resize(patch, (pw + 20, ph + 20))
    pmask = np.zeros(patch.shape[:2], np.uint8)
    pmask[10:10 + ph, 10:10 + pw] = pm8[y0:y1 + 1, x0:x1 + 1]
    center = (int(x0 + pw / 2), int(y0 + ph / 2))
    clean = cv2.seamlessClone(patch, clean, pmask, center, cv2.NORMAL_CLONE)
m |= fl

# plaque: repaint the centre as plain carved wood (the live title is drawn over it)
px0, py0, px1, py1 = 338, 48, 958, 126
top_c = clean[py0 - 4:py0, px0:px1].reshape(-1, 3).mean(axis=0)
bot_c = clean[py1:py1 + 4, px0:px1].reshape(-1, 3).mean(axis=0)
rng0 = np.random.default_rng(9)
for y in range(py0, py1):
    k = (y - py0) / (py1 - py0)
    row = top_c * (1 - k) + bot_c * k
    noise = rng0.normal(0, 4, (px1 - px0, 3)) + np.sin(np.arange(px1 - px0) * 0.07 + y * 0.01)[:, None] * 5
    clean[y, px0:px1] = np.clip(row + noise, 0, 255)
pm = np.zeros((H, W), np.float32); pm[py0:py1, px0:px1] = 1
pm = cv2.GaussianBlur(pm, (0, 0), 3)[..., None]
clean = (clean * pm + bgr * (1 - pm)).astype(np.uint8) if False else clean

# the gibberish letters on the two wooden signs: soften them into the grain
for x0, y0, x1, y1 in [(84, 2096, 320, 2196), (898, 2088, 1092, 2214)]:
    clean[y0:y1, x0:x1] = cv2.GaussianBlur(clean[y0:y1, x0:x1], (0, 0), 6)
m[2096:2196, 84:320] = 255; m[2088:2214, 898:1092] = 255

clean_rgb = cv2.cvtColor(clean, cv2.COLOR_BGR2RGB)
Image.fromarray(clean_rgb).save(f'{out}/playfield.jpg', quality=88, optimize=True, progressive=True)
Image.fromarray(np.where(m[..., None] > 0, [255, 0, 255], clean_rgb).astype(np.uint8)).resize((W // 3, H // 3)).save(f'{out}/../tools/mask-preview.jpg', quality=70)

# ---- screen extensions (fill the 13 Pro Max screen above and below the painting)
top_row = clean_rgb[:6].mean(axis=0)  # per-column sky colour
ext_top = np.zeros((160, W, 3), np.float32)
for y in range(160):
    k = y / 159
    ext_top[y] = top_row * (0.55 + 0.45 * k)
rng = np.random.default_rng(3)
for _ in range(90):  # a few stars
    x, y = rng.integers(0, W), rng.integers(0, 150)
    b = rng.uniform(120, 255)
    ext_top[y, x] = [b, b, b * 1.05]
ext_top = cv2.GaussianBlur(ext_top, (0, 0), 0.6)
Image.fromarray(np.clip(ext_top, 0, 255).astype(np.uint8)).save(f'{out}/ext-top.jpg', quality=88)

EB = 640
strip = clean_rgb[H - EB:][::-1].astype(np.float32)  # mirrored continuation of the forest floor
fade = (np.linspace(1, 0, EB) ** 2.2 * 0.42 + 0.03)[:, None, None]
strip = cv2.GaussianBlur(strip, (0, 0), 7) * fade
Image.fromarray(np.clip(strip, 0, 255).astype(np.uint8)).save(f'{out}/ext-bottom.jpg', quality=85)

# ---- round purple buttons from the second concept image (same layout)
btn = np.array(Image.open(btn_src).convert('RGB'))[TOP:BOTTOM]


def cut_button(cx, cy, r, name, erase_digit=None):
    crop = btn[cy - r:cy + r, cx - r:cx + r].copy()
    if erase_digit:
        dm = np.zeros(crop.shape[:2], np.uint8)
        x0, y0, x1, y1 = erase_digit
        dm[y0:y1, x0:x1] = 255
        fixed = crop.copy()
        cv2.xphoto.inpaint(cv2.cvtColor(crop, cv2.COLOR_RGB2BGR), 255 - dm, fixed, cv2.xphoto.INPAINT_FSR_FAST)
        crop = cv2.cvtColor(fixed, cv2.COLOR_BGR2RGB)
    im = Image.fromarray(crop).convert('RGBA')
    a = Image.new('L', im.size, 0)
    ImageDraw.Draw(a).ellipse((3, 3, 2 * r - 3, 2 * r - 3), fill=255)
    im.putalpha(a.filter(ImageFilter.GaussianBlur(1)))
    im.save(f'{out}/{name}.png', optimize=True)


cut_button(122, 510, 80, 'btn-pause')
cut_button(1162, 510, 80, 'btn-camera', erase_digit=(62, 68, 98, 106))

# ---- occluders: tall objects cut from the ORIGINAL painting, drawn over the ball when it passes behind
import json, os
os.makedirs(f'{out}/sprites', exist_ok=True)
src = Image.fromarray(art).convert('RGBA')


def obj(name, base, polys=(), ellipses=(), rects=()):
    m = Image.new('L', (W, H), 0)
    dd = ImageDraw.Draw(m)
    for p in polys: dd.polygon(p, fill=255)
    for cx, cy, rx, ry in ellipses: dd.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
    for r in rects: dd.rectangle(r, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(2))
    bbox = m.getbbox()
    sp = src.copy(); sp.putalpha(m)
    sp.crop(bbox).save(f'{out}/sprites/{name}.png', optimize=True)
    return {'box': list(bbox), 'base': list(base)}


meta = {
    'tower': obj('tower', (632, 1010), polys=[[(485, 540), (500, 470), (560, 425), (640, 410), (720, 420), (785, 465), (797, 540), (762, 562), (726, 600), (732, 840), (738, 960), (716, 1018), (572, 1018), (544, 960), (534, 840), (540, 600), (506, 562)]]),
    'wizard': obj('wizard', (850, 1110), polys=[[(858, 878), (884, 948), (906, 1000), (918, 1112), (798, 1118), (802, 1040), (790, 1002), (752, 992), (744, 936), (784, 920), (828, 948), (842, 902)]]),
    'mush3': obj('mush3', (440, 835), ellipses=[(435, 765, 52, 48)], rects=[(420, 790, 460, 840)]),
    'mush2': obj('mush2', (398, 1148), ellipses=[(395, 1078, 54, 42)], rects=[(378, 1100, 416, 1150)]),
    'mush1': obj('mush1', (337, 1372), ellipses=[(337, 1295, 54, 46)], rects=[(318, 1320, 356, 1376)]),
    'crystal1': obj('crystal1', (230, 1150), polys=[[(158, 1152), (163, 1060), (205, 996), (252, 1026), (292, 1058), (302, 1152)]]),
    'crystal2': obj('crystal2', (1140, 1400), polys=[[(1078, 1398), (1083, 1300), (1120, 1243), (1162, 1258), (1202, 1298), (1204, 1402)]]),
    'potion': obj('potion', (1000, 665), ellipses=[(1000, 607, 64, 62)], rects=[(978, 516, 1022, 560)]),
    'pedestal': obj('pedestal', (152, 1452), polys=[[(98, 1238), (150, 1222), (176, 1400), (198, 1458), (112, 1462)]]),
}
meta['flipper-l'] = {'box': list(boxes['flipper-l'])}
meta['flipper-r'] = {'box': list(boxes['flipper-r'])}
json.dump(meta, open(f'{out}/sprites/sprites.json', 'w'), indent=1)
with open(f'{out}/../js/render/sprite-meta.js', 'w') as fh:  # same data as a module (no fetch needed)
    fh.write('// Generated by tools/prepare_art.py – where each cut-out sprite sits in the painting.\nexport const SPRITES = ' + json.dumps(meta) + ';\n')

# ---- the ball: the emerald-and-gold orb from the painting
bx, by, br = 1186, 1760, 50
orb = src.crop((bx - br, by - br, bx + br, by + br))
a = Image.new('L', orb.size, 0)
ImageDraw.Draw(a).ellipse((4, 4, 2 * br - 4, 2 * br - 4), fill=255)
orb.putalpha(a.filter(ImageFilter.GaussianBlur(1.2)))
orb.resize((96, 96), Image.LANCZOS).save(f'{out}/sprites/ball.png', optimize=True)

print('art size', W, H, 'flipper boxes', boxes)
