"""Builds the playfield texture from the concept art (pinball/assets/concept.jpg):
removes all printed text, the drawn flippers (real 3D flippers are placed over them),
the drawn ball, the right-middle and castle flippers. Upscales 2x for iPhone retina screens.
Run:  python3 pinball/tools/make_playfield.py
"""
import cv2
import numpy as np
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', 'assets')
src = cv2.imread(os.path.join(ASSETS, 'concept.jpg'))
H, W = src.shape[:2]

# --- text boxes (x0, y0, x1, y1) in source pixels
TEXT = [
    (312, 170, 450, 202),    # 3 mushrooms
    (128, 346, 262, 400),    # wizard tower
    (426, 348, 674, 400),    # castle & princess
    (660, 394, 740, 442),    # crystal ramp
    (272, 518, 510, 552),    # centre note
    (556, 598, 662, 654),    # prince shield (upper)
    (488, 670, 588, 700),    # mystery hole (upper)
    (100, 686, 240, 736),    # dwarf mine
    (332, 813, 440, 844),    # magic pool
    (468, 818, 567, 850),    # prince shield (lower)
    (423, 966, 507, 994),    # mystery hole
    (408, 1026, 507, 1056),  # mystery hole
    (233, 1014, 367, 1044),  # mine lights caption
    (58, 953, 99, 979),      # side caption L
    (608, 953, 657, 982),    # side caption R
    (243, 1276, 478, 1334),  # bottom caption
]

def text_mask(img):
    m = np.zeros((H, W), np.uint8)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    b, g, r = [img[:, :, i].astype(int) for i in range(3)]
    for (x0, y0, x1, y1) in TEXT:
        roi_v = hsv[y0:y1, x0:x1, 2].astype(int)
        warm = (r[y0:y1, x0:x1] - b[y0:y1, x0:x1])
        fill = ((roi_v > 150) & (warm > 18)) | (roi_v > 225)
        sub = np.zeros((y1 - y0, x1 - x0), np.uint8)
        sub[fill] = 255
        sub = cv2.dilate(sub, np.ones((3, 3), np.uint8), iterations=4)  # include the dark outline
        m[y0:y1, x0:x1] = np.maximum(m[y0:y1, x0:x1], sub)
    # captions over plain ground/stone/wood: drop the whole box so the fill is one coherent texture
    for (x0, y0, x1, y1) in RECTS:
        m[y0:y1, x0:x1] = 255
    return m

RECTS = [
    (138, 352, 256, 397),    # wizard tower caption (on the tower wood)
    (284, 522, 504, 550),    # centre note
    (106, 690, 236, 733),    # dwarf mine caption
    (336, 817, 436, 841),    # magic pool caption
    (472, 822, 563, 847),    # prince shield (lower)
    (427, 969, 503, 991),    # mystery hole captions
    (412, 1030, 503, 1053),
    (237, 1018, 363, 1041),  # mine lights caption
    (247, 1280, 474, 1330),  # bottom caption
    (318, 174, 446, 198),    # 3 mushrooms caption
]

def capsule(m, p, q, r):
    cv2.line(m, p, q, 255, thickness=int(r * 2))
    cv2.circle(m, p, int(r), 255, -1)
    cv2.circle(m, q, int(r), 255, -1)

mask = text_mask(src)
shapes = np.zeros((H, W), np.uint8)
capsule(shapes, (238, 1134), (314, 1180), 21)   # lower left flipper
capsule(shapes, (482, 1134), (406, 1180), 21)   # lower right flipper
capsule(shapes, (184, 618), (249, 652), 19)     # upper left flipper
capsule(shapes, (394, 464), (444, 506), 20)     # castle flipper (removed from the game)
capsule(shapes, (574, 737), (590, 808), 15)     # right-middle flipper (removed from the game)
cv2.circle(shapes, (589, 810), 15, 255, -1)
cv2.circle(shapes, (712, 1210), 17, 255, -1)    # drawn ball in the plunger lane
SHIELDS = [(579, 501), (599, 538), (616, 576)]     # drop targets: drawn separately as sprites
for (sx, sy) in SHIELDS:
    cv2.ellipse(shapes, (sx, sy), (21, 23), 0, 0, 360, 255, -1)
# mushrooms that get moved apart in the game: cut out as sprites, their old spot is filled
# (name, cap centre, cap radii, stem bottom y, stem half width)
MUSHROOMS = [('purple', (336, 247), (39, 28), 300, 15), ('teal', (395, 300), (38, 25), 348, 21)]
def mushroom_mask(cx, cy, rx, ry, stem_y, sw, grow=0):
    mm = np.zeros((H, W), np.uint8)
    cv2.ellipse(mm, (cx, cy), (rx + grow, ry + grow), 0, 0, 360, 255, -1)
    cv2.rectangle(mm, (cx - sw - grow, cy), (cx + sw + grow, stem_y + grow), 255, -1)
    cv2.ellipse(mm, (cx, stem_y), (sw + 8 + grow, 7 + grow), 0, 0, 360, 255, -1)
    return mm
for (_, (cx, cy), (rx, ry), sy, sw) in MUSHROOMS:
    shapes = np.maximum(shapes, mushroom_mask(cx, cy, rx, ry, sy, sw, grow=4))
mask = np.maximum(mask, shapes)

# patches cloned from matching neighbouring texture (better than inpainting for big areas)
CLONES = [  # (dst x0, y0, x1, y1, src dx, src dy)
    (662, 392, 742, 446, 0, 54),     # 'crystal ramp' caption over the wires → wires below
]
base = src.copy()
for (x0, y0, x1, y1, dx, dy) in CLONES:
    patch = src[y0 + dy:y1 + dy, x0 + dx:x1 + dx].astype(np.float32)
    a = np.zeros((y1 - y0, x1 - x0), np.float32)
    cv2.rectangle(a, (6, 6), (x1 - x0 - 7, y1 - y0 - 7), 1.0, -1)
    a = cv2.GaussianBlur(a, (0, 0), 4)[..., None]
    base[y0:y1, x0:x1] = (patch * a + base[y0:y1, x0:x1] * (1 - a)).astype(np.uint8)
    mask[y0 + 4:y1 - 4, x0 + 4:x1 - 4] = 0
# texture-synthesising inpainting. Default: patch-based SHIFTMAP over the whole image (real
# stone/grass/wood). Overrides where that copied unrelated objects (picked by visual comparison).
valid_all = (mask == 0).astype(np.uint8) * 255
clean = base.copy()
cv2.xphoto.inpaint(base, valid_all, clean, cv2.xphoto.INPAINT_SHIFTMAP)

def region_fill(box, crop, method):
    """Re-fill the masked pixels inside box using only the pixels inside crop."""
    x0, y0, x1, y1 = crop
    sub = base[y0:y1, x0:x1].copy()
    hole = np.zeros(mask.shape, bool)
    bx0, by0, bx1, by1 = box
    hole[by0:by1, bx0:bx1] = mask[by0:by1, bx0:bx1] > 0
    h = hole[y0:y1, x0:x1]
    out = sub.copy()
    cv2.xphoto.inpaint(sub, (~h).astype(np.uint8) * 255, out, method)
    reg = clean[y0:y1, x0:x1]
    reg[h] = out[h]

def region_clone(box, dx, dy):
    """Copy texture from an offset area of the already-cleaned image into the masked pixels."""
    x0, y0, x1, y1 = box
    hole = mask[y0:y1, x0:x1] > 0
    src_patch = clean[y0 + dy:y1 + dy, x0 + dx:x1 + dx]
    clean[y0:y1, x0:x1][hole] = src_patch[hole]

FSR = cv2.xphoto.INPAINT_FSR_FAST if os.environ.get("FAST") else cv2.xphoto.INPAINT_FSR_BEST
region_fill((100, 686, 240, 736), (60, 690, 290, 800), FSR)      # dwarf mine caption (crop excludes the lights)
region_fill((243, 1276, 478, 1334), (200, 1262, 520, 1360), FSR)  # bottom caption
region_fill((312, 170, 450, 202), (300, 168, 470, 240), FSR)      # mushrooms caption
region_fill((556, 718, 612, 834), (520, 700, 640, 860), FSR)      # removed right-middle flipper
region_fill((214, 1110, 338, 1204), (190, 1090, 360, 1222), FSR)  # lower left flipper spot
region_fill((382, 1110, 506, 1204), (360, 1090, 530, 1222), FSR)  # lower right flipper spot
region_fill((162, 596, 272, 674), (140, 580, 290, 690), FSR)      # upper left flipper spot
region_fill((128, 346, 262, 400), (124, 312, 290, 402), cv2.xphoto.INPAINT_SHIFTMAP)  # tower caption: only tower wood around it
region_fill((290, 214, 440, 360), (270, 196, 452, 400), FSR)      # old purple/teal mushroom spots (dark glade ground)

# feather the patch edges a little
soft = cv2.GaussianBlur((mask > 0).astype(np.float32), (0, 0), 1.2)[..., None]
clean = np.clip(clean * soft + base * (1 - soft), 0, 255).astype(np.uint8)

# ---- spread the lower structures apart (same transform as STRUCTURE_MOVES in js/layout.js) ----
# (polygon in source px, scale, (dx, dy)); scale is about the polygon's bounding-box centre
MOVES = [
    ([(178, 772), (250, 756), (344, 770), (392, 836), (394, 962), (366, 1000), (360, 1024), (240, 1024), (238, 1000), (212, 960), (196, 880)], 0.86, (-40, -6)),   # dwarf mine + its 5 lights
    ([(398, 846), (472, 838), (536, 854), (574, 896), (574, 1002), (510, 1046), (400, 1042)], 0.84, (18, -8)),                                                   # prince shield + right sling
]
def poly_mask1(pts):
    mm = np.zeros((H, W), np.uint8); cv2.fillPoly(mm, [np.array(pts, np.int32)], 255); return mm
moved_src = clean.copy()
vac = np.zeros((H, W), np.uint8)
for pts, _, _ in MOVES: vac |= cv2.dilate(poly_mask1(pts), np.ones((7, 7), np.uint8))
# where the moved structures will land (those pixels get covered anyway)
cover = np.zeros((H, W), np.uint8)
for pts, sc, (dx, dy) in MOVES:
    P = np.array(pts, np.float32); c0 = (P.min(0) + P.max(0)) / 2
    Q = (P - c0) * sc + c0 + np.array([dx, dy], np.float32)
    cv2.fillPoly(cover, [Q.astype(np.int32)], 255)
cover = cv2.erode(cover, np.ones((5, 5), np.uint8))
vis = (vac > 0) & (cover == 0)
if os.environ.get("FAST"): print("vis px", int(vis.sum()), "vac", int((vac>0).sum()), "cover", int((cover>0).sum()))
# the part that stays visible gets real floor texture: the drawing's own stone/grass floor
# (swatch above the flippers) tiled with mirroring, then gradient-blended into its surroundings
sw = src[1050:1104, 250:470]
tile = np.vstack([np.hstack([sw, sw[:, ::-1]]), np.hstack([sw[::-1], sw[::-1, ::-1]])])
cx0, cy0, cx1, cy1 = 120, 740, 640, 1112
# random soft-edged patches from the swatch (no repeating / mirrored pattern)
rng = np.random.default_rng(11)
P = 46; win = np.outer(np.hanning(P), np.hanning(P)).astype(np.float32)[..., None] + 1e-3
acc = np.zeros((cy1 - cy0 + P, cx1 - cx0 + P, 3), np.float32); wsum = np.zeros(acc.shape[:2] + (1,), np.float32)
swf = sw.astype(np.float32)
for yy in range(0, cy1 - cy0 + 1, P // 3):
    for xx in range(0, cx1 - cx0 + 1, P // 3):
        oy = rng.integers(0, swf.shape[0] - P + 1); ox = rng.integers(0, swf.shape[1] - P + 1)
        patch = swf[oy:oy + P, ox:ox + P]
        if rng.random() < 0.5: patch = patch[:, ::-1]
        acc[yy:yy + P, xx:xx + P] += patch * win; wsum[yy:yy + P, xx:xx + P] += win
tex_big = (acc / np.maximum(wsum, 1e-3))[P // 2:P // 2 + cy1 - cy0, P // 2:P // 2 + cx1 - cx0]
vis_c = vis[cy0:cy1, cx0:cx1]
dst = clean[cy0:cy1, cx0:cx1].astype(np.float32)
# local colour of the surrounding floor (normalised blur that ignores the vacated pixels)
pool_x = np.zeros((H, W), np.uint8); cv2.ellipse(pool_x, (376, 726), (112, 80), 0, 0, 360, 255, -1)
wgt = ((vac[cy0:cy1, cx0:cx1] == 0) & (pool_x[cy0:cy1, cx0:cx1] == 0)).astype(np.float32)
sig = 16
wb = cv2.GaussianBlur(wgt, (0, 0), sig)[..., None]
mean = cv2.GaussianBlur(dst * wgt[..., None], (0, 0), sig) / np.maximum(wb, 1e-3)
wb2 = cv2.GaussianBlur(wgt, (0, 0), 60)[..., None]                     # wide fallback where no floor is near
mean2 = cv2.GaussianBlur(dst * wgt[..., None], (0, 0), 60) / np.maximum(wb2, 1e-3)
t = np.clip(wb / 0.25, 0, 1)
mean = mean * t + mean2 * (1 - t)
# fine detail of the swatch on top of that colour
texf = tex_big.astype(np.float32)
detail = texf - cv2.GaussianBlur(texf, (0, 0), sig)
fill = np.clip(mean + detail * 1.3, 0, 255)  # patch averaging softens detail a little; restore it
k = cv2.GaussianBlur(cv2.dilate(vis_c.astype(np.uint8) * 255, np.ones((5, 5), np.uint8)).astype(np.float32) / 255, (0, 0), 2)[..., None]
clean[cy0:cy1, cx0:cx1] = np.clip(fill * k + dst * (1 - k), 0, 255).astype(np.uint8)
# paste each structure, scaled and moved, with a soft edge
for pts, sc, (dx, dy) in MOVES:
    mm = poly_mask1(pts)
    x, y, w, h = cv2.boundingRect(mm)
    spr = moved_src[y:y + h, x:x + w]
    a = cv2.GaussianBlur(mm[y:y + h, x:x + w], (0, 0), 1.4).astype(np.float32) / 255
    nw, nh = round(w * sc), round(h * sc)
    spr = cv2.resize(spr, (nw, nh), interpolation=cv2.INTER_AREA)
    a = cv2.resize(a, (nw, nh), interpolation=cv2.INTER_LINEAR)[..., None]
    ccx, ccy = x + w / 2, y + h / 2
    X, Y = round(ccx - nw / 2 + dx), round(ccy - nh / 2 + dy)
    roi = clean[Y:Y + nh, X:X + nw].astype(np.float32)
    clean[Y:Y + nh, X:X + nw] = (spr * a + roi * (1 - a)).astype(np.uint8)
    print('moved', (x, y, w, h), 'centre', (ccx, ccy))

def up(img):
    big = cv2.resize(img, (W * 2, H * 2), interpolation=cv2.INTER_LANCZOS4)
    g = cv2.GaussianBlur(big, (0, 0), 1.2)
    return cv2.addWeighted(big, 1.35, g, -0.35, 0)  # mild unsharp mask

cv2.imwrite(os.path.join(ASSETS, 'playfield.jpg'), up(clean), [cv2.IMWRITE_JPEG_QUALITY, 90])
# drop-target sprites (original pixels, soft elliptical alpha)
big = up(src)
for i, (sx, sy) in enumerate(SHIELDS):
    r = 26
    crop = big[(sy - r) * 2:(sy + r) * 2, (sx - r) * 2:(sx + r) * 2]
    a = np.zeros(crop.shape[:2], np.uint8)
    cv2.ellipse(a, (r * 2, r * 2), (46, 50), 0, 0, 360, 255, -1)
    a = cv2.GaussianBlur(a, (0, 0), 3)
    cv2.imwrite(os.path.join(ASSETS, f'target{i}.png'), np.dstack([crop, a]))
cv2.imwrite(os.path.join(HERE, '..', '..', '.mask_preview.png'), mask) if os.environ.get('MASK') else None
# mushroom sprites (original pixels, soft alpha); the game draws them at their new places
for (name, (cx, cy), (rx, ry), sy, sw) in MUSHROOMS:
    a = cv2.GaussianBlur(mushroom_mask(cx, cy, rx, ry, sy, sw, grow=2), (0, 0), 1.5)
    x0, y0, x1, y1 = cx - 46, cy - 36, cx + 46, sy + 14
    crop = big[y0 * 2:y1 * 2, x0 * 2:x1 * 2]
    alpha = cv2.resize(a[y0:y1, x0:x1], (crop.shape[1], crop.shape[0]), interpolation=cv2.INTER_LINEAR)
    cv2.imwrite(os.path.join(ASSETS, f'mush_{name}.png'), np.dstack([crop, alpha]))
print('ok', W, H)
