"""Builds the playfield texture from the concept art (pinball/assets/concept.jpg):
removes all printed text, the drawn flippers (real 3D flippers are placed over them),
the drawn ball, and the right-middle flipper. Upscales 2x for iPhone retina screens.
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
        sub = cv2.dilate(sub, np.ones((3, 3), np.uint8), iterations=3)  # include the dark outline
        m[y0:y1, x0:x1] = np.maximum(m[y0:y1, x0:x1], sub)
    return m

def capsule(m, p, q, r):
    cv2.line(m, p, q, 255, thickness=int(r * 2))
    cv2.circle(m, p, int(r), 255, -1)
    cv2.circle(m, q, int(r), 255, -1)

mask = text_mask(src)
shapes = np.zeros((H, W), np.uint8)
capsule(shapes, (238, 1134), (314, 1180), 21)   # lower left flipper
capsule(shapes, (482, 1134), (406, 1180), 21)   # lower right flipper
capsule(shapes, (184, 618), (249, 652), 19)     # upper left flipper
capsule(shapes, (394, 464), (444, 506), 17)     # castle flipper
capsule(shapes, (575, 741), (590, 808), 13)     # right-middle flipper (removed from the game)
cv2.circle(shapes, (589, 810), 15, 255, -1)
cv2.circle(shapes, (712, 1210), 17, 255, -1)    # drawn ball in the plunger lane
SHIELDS = [(579, 501), (599, 538), (616, 576)]     # drop targets: drawn separately as sprites
for (sx, sy) in SHIELDS:
    cv2.ellipse(shapes, (sx, sy), (21, 23), 0, 0, 360, 255, -1)
mask = np.maximum(mask, shapes)

# patches cloned from matching neighbouring texture (better than inpainting for big areas)
CLONES = [  # (dst x0, y0, x1, y1, src dx, src dy)
    (662, 392, 742, 446, 0, 54),     # 'crystal ramp' caption over the wires → wires below
    (600, 596, 664, 656, 0, 62),     # 'prince shield' caption over the crystal ramp → ramp below
]
base = src.copy()
for (x0, y0, x1, y1, dx, dy) in CLONES:
    patch = src[y0 + dy:y1 + dy, x0 + dx:x1 + dx].astype(np.float32)
    a = np.zeros((y1 - y0, x1 - x0), np.float32)
    cv2.rectangle(a, (6, 6), (x1 - x0 - 7, y1 - y0 - 7), 1.0, -1)
    a = cv2.GaussianBlur(a, (0, 0), 4)[..., None]
    base[y0:y1, x0:x1] = (patch * a + base[y0:y1, x0:x1] * (1 - a)).astype(np.uint8)
    mask[y0 + 4:y1 - 4, x0 + 4:x1 - 4] = 0
clean = cv2.inpaint(base, mask, 6, cv2.INPAINT_TELEA)
# second pass with a soft blend so large patches don't look smeared
blur = cv2.GaussianBlur(clean, (0, 0), 2.2)
soft = cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), 3)[..., None]
noise = np.random.default_rng(3).normal(0, 6, clean.shape)
clean = np.clip(clean * (1 - soft * 0.5) + blur * soft * 0.5 + noise * soft, 0, 255).astype(np.uint8)

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
