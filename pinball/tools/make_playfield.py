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

FSR = cv2.xphoto.INPAINT_FSR_BEST
region_fill((100, 686, 240, 736), (60, 690, 290, 800), FSR)      # dwarf mine caption (crop excludes the lights)
region_fill((243, 1276, 478, 1334), (200, 1262, 520, 1360), FSR)  # bottom caption
region_fill((312, 170, 450, 202), (300, 168, 470, 240), FSR)      # mushrooms caption
region_fill((556, 718, 612, 834), (520, 700, 640, 860), FSR)      # removed right-middle flipper
region_fill((128, 346, 262, 400), (124, 312, 290, 402), cv2.xphoto.INPAINT_SHIFTMAP)  # tower caption: only tower wood around it

# feather the patch edges a little
soft = cv2.GaussianBlur((mask > 0).astype(np.float32), (0, 0), 1.2)[..., None]
clean = np.clip(clean * soft + base * (1 - soft), 0, 255).astype(np.uint8)

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
print('ok', W, H)
