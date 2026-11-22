# Table 2 – "Forest Kingdom" – art brief

How to use: attach two reference images to the image generator together with the prompt below.
1. **Style reference**: the current table painting (the original concept image of Forest Pinball Saga).
2. **Layout reference**: `דרך-ב-ממלכת-היער.png` (the approved layout sketch).

Generate in portrait, as an iPhone 13 Pro Max screenshot: **1284 × 2778 px**. If the tool cannot do that size,
use the tallest portrait ratio it offers (9:19.5, or 9:16) – the pipeline crops and rescales.

## Prompt (copy as is)

```
A highly detailed fantasy pinball table seen from the player's end, top-down 3/4 perspective, portrait
orientation, mobile game screenshot, painted in exactly the same style, colours, lighting and level of detail
as the attached reference painting (lush enchanted forest, warm magical glow, rich painterly textures,
golden wooden cabinet rails, starry night sky with waterfalls in the background beyond the table).

At the very top, the same ornate wooden-and-gold score frame as the reference, with a title plaque
reading "FOREST KINGDOM" and an EMPTY dark score panel below it (no numbers), with three small empty
label boxes underneath. Below the frame, two round purple buttons: pause (left) and camera (right).

The playfield, from top to bottom:
- Upper LEFT corner: a tall wizard's tower with a mushroom-shaped roof and glowing windows, a small
  wooden door at its base with stone steps. An old wizard in a blue robe with a staff stands beside it.
  A thin wire ramp curves around the left side of the tower.
- Upper RIGHT corner: a white stone fairy-tale castle with two round turrets with blue conical roofs and
  red flags, a big wooden arched gate at the front, and a princess in a pink dress waving from a small
  balcony above the gate.
- Upper CENTRE, between tower and castle: three large glowing mushroom bumpers (orange, purple, teal)
  in a triangle, each with a white stem.
- Middle LEFT: the entrance of a dwarves' mine dug into a rocky hill, with wooden beams, a small mine cart
  full of glowing gems on rails, and seven tiny red dwarf hats lined up in front of it.
- Middle RIGHT: a long transparent crystal ramp on a golden wire frame, starting to the right of the castle
  and running down the right side of the table to the lower right.
- CENTRE: three blue-and-gold heraldic shields standing upright in a row (drop targets), and a young
  prince in blue with a small crown standing next to them.
- A small dark round kickout hole with a stone rim to the right of centre.
- Lower centre: a round magic pool with glowing turquoise water inside a stone-and-root ring.
- Bottom: two triangular slingshots with glowing green rune rubbers, curved wooden inlane/outlane rails
  with four small empty slot-shaped light inserts (two on each side), two wooden flippers with glowing
  runes pointing towards a centre drain, and on the far right a plunger lane with a spring and a green
  emerald plunger knob.
- Open grassy space between the elements so a ball can roll everywhere; no clutter on the playing lanes.

Important: no text anywhere except "FOREST KINGDOM" on the plaque; no ball on the table; no UI overlays,
no watermarks; the whole table must be visible, centred, symmetrical cabinet, same camera angle and
perspective as the reference.
```

## What I need back
- The image as PNG/JPG at full resolution (not a screenshot of a preview).
- If something is off (an element in the wrong place, text on the table), it is fine – send it anyway with a note;
  small things I can fix in the art pipeline, big ones we regenerate.

## What happens next (my side)
1. Crop the painted area, clean any stray text, cut every tall object into sprites (tower, castle, wizard,
   princess, prince, shields, mushrooms, mine, crystal ramp) so the ball can pass behind them.
2. Trace the walls, ramps and targets into the physics table (same engine as table 1).
3. Build the new rules: castle gate + locks → "Rescue the Princess" multiball, shield drop targets →
   prince hurry-up, mine scoop + 7 dwarf lamps → gem jackpot, fairy spinner, final mode against the dragon.
4. Table select screen ("Enchanted Forest" / "Forest Kingdom"), tests, bot balance run, delivery.
