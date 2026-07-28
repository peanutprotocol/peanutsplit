#!/usr/bin/env python3
"""Re-draw a stroked path set as though a hand had drawn it.

Both drawing systems go through here at build time — the labelled figures in
`figures.py` and the chrome doodles in `doodles.py` — so the app pays nothing at
runtime and the shipped asset is already drawn. Nothing here is random: every
figure is seeded, so two builds of the same source produce byte-identical output
and a diff means somebody changed a drawing.

Three things took several rounds to get right, and undoing any of them brings
back a specific bug:

1.  **The noise is a field in space, not noise along the stroke.** hull-plan
    draws the red port half *over* the ink hull outline. Displace each stroke by
    its own arc-length noise and the two separate into two visibly different
    lines, and the figure reads as a tangle — seeding from the path data does not
    fix it either, because the strokes overlap without being identical. One
    smooth 2-D field per drawing means anything passing through a point gets the
    same push: coincident stays coincident, parallel stays parallel, and the
    result reads as a drawing traced onto slightly crumpled paper.

2.  **Corners are found before anything moves, and kept.** A Catmull-Rom spline
    run through a rudder's four corners produces a bean. Anything turning more
    than 40 degrees in a single sample step is a corner, not a curve.

3.  **The sample step is capped per subpath, corner-aware.** A step sized for a
    460-unit figure gives the 44-unit cabin box inside it four samples and rounds
    it away; the compass rose, eight sharp points in one subpath, becomes a
    flower. Every subpath gets at least ten samples and at least three per
    drawing command.

Only what the two shipped settings need is implemented: one pass, no overdraw,
no taper, no overshoot. The picker in preview/day-skipper-doodle/ carries those
and is the place to try them.
"""
import math
import re

# The two settings that ship. `amp` and `step` are fractions of the drawing's
# own size, so one setting reads the same on a 32-unit doodle and a 460-unit
# figure. `wobble` multiplies the step to give the field's wavelength — how far
# the hand drifts before it corrects. `jitter` is how much of the push is
# per-stroke tremble rather than the shared field; the figures use none of it,
# because a wobble you can see *within* one stroke reads as noise on a drawing
# somebody has to take a measurement off.
FIGURE = dict(step=0.09, amp=0.003, wobble=1.6, jitter=0.0, seed=5)     # "L1 breath"
DOODLE = dict(step=0.22, amp=0.050, wobble=1.4, jitter=0.25, seed=47)   # "B5 loose & wonky"

_NUM = r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?"
_TOKENS = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]|" + _NUM)
# An arc's two flags are single characters and may be written with no separator
# at all — `a5 5 0 0110 20` is legal and means flags 0,1 then x=10. Tokenised as
# plain numbers that reads as 0110, and the arc comes out silently wrong rather
# than failing. Arcs are therefore re-tokenised argument by argument.
_ARC_ARGS = re.compile(r"\s*,?\s*(" + _NUM + r")\s*,?\s*(" + _NUM + r")\s*,?\s*("
                       + _NUM + r")\s*,?\s*([01])\s*,?\s*([01])\s*,?\s*("
                       + _NUM + r")\s*,?\s*(" + _NUM + r")")
_ARGS = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0}


# ── flattening ───────────────────────────────────────────────────────────────
# The browser gives you getPointAtLength(); here we have to build it. Every
# segment is subdivided into a polyline first, then resampled by arc length off
# that. 24 steps a curve is far finer than the 10–40 samples any setting asks
# for, so the resampling — not the flattening — is what sets the result.

_FLAT = 24


def _cubic(p0, p1, p2, p3, out):
    for i in range(1, _FLAT + 1):
        t = i / _FLAT
        u = 1 - t
        out.append((u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]))


def _quad(p0, p1, p2, out):
    _cubic(p0, (p0[0] + 2 / 3 * (p1[0] - p0[0]), p0[1] + 2 / 3 * (p1[1] - p0[1])),
           (p2[0] + 2 / 3 * (p1[0] - p2[0]), p2[1] + 2 / 3 * (p1[1] - p2[1])), p2, out)


def _arc(p0, rx, ry, phi, large, sweep, p1, out):
    """Endpoint-parameterised arc → polyline (SVG implementation notes F.6)."""
    if rx == 0 or ry == 0 or (abs(p0[0] - p1[0]) < 1e-12 and abs(p0[1] - p1[1]) < 1e-12):
        out.append(p1)
        return
    rx, ry = abs(rx), abs(ry)
    cosp, sinp = math.cos(math.radians(phi)), math.sin(math.radians(phi))
    dx2, dy2 = (p0[0] - p1[0]) / 2, (p0[1] - p1[1]) / 2
    x1, y1 = cosp * dx2 + sinp * dy2, -sinp * dx2 + cosp * dy2
    lam = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry)
    if lam > 1:                                   # radii too small: scale them up
        s = math.sqrt(lam)
        rx, ry = rx * s, ry * s
    num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
    den = rx * rx * y1 * y1 + ry * ry * x1 * x1
    co = math.sqrt(max(0.0, num / den)) * (-1 if large == sweep else 1)
    cx1, cy1 = co * rx * y1 / ry, -co * ry * x1 / rx
    cx = cosp * cx1 - sinp * cy1 + (p0[0] + p1[0]) / 2
    cy = sinp * cx1 + cosp * cy1 + (p0[1] + p1[1]) / 2

    def ang(ux, uy, vx, vy):
        d = math.hypot(ux, uy) * math.hypot(vx, vy)
        a = math.acos(max(-1.0, min(1.0, (ux * vx + uy * vy) / d))) if d else 0.0
        return -a if ux * vy - uy * vx < 0 else a

    t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
    dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
    if not sweep and dt > 0:
        dt -= 2 * math.pi
    elif sweep and dt < 0:
        dt += 2 * math.pi
    n = max(2, int(abs(dt) / (math.pi / 2) * _FLAT))
    for i in range(1, n + 1):
        a = t1 + dt * i / n
        px, py = rx * math.cos(a), ry * math.sin(a)
        out.append((cosp * px - sinp * py + cx, sinp * px + cosp * py + cy))


def _space_arcs(d):
    """Rewrite every arc's arguments in spaced form before tokenising.

    The tokeniser reads numbers; an arc's two flags are single characters that
    may run straight into the next coordinate. Normalising here is much less
    invasive than teaching a token-index parser to switch grammars mid-command.
    """
    out, i = [], 0
    while i < len(d):
        c = d[i]
        out.append(c)
        i += 1
        if c not in "Aa":
            continue
        while True:                                # one command can carry several arcs
            m = _ARC_ARGS.match(d, i)
            if not m:
                break
            out.append(" " + " ".join(m.groups()) + " ")
            i = m.end()
    return "".join(out)


def subpaths(d):
    """Split `d` into subpaths, each a polyline plus whether it closed.

    Only the leading moveto needs absolutising; everything after it is already
    self-consistent within its own subpath. The subpath's original command text
    is kept too, because the sample floor counts commands.
    """
    toks = _TOKENS.findall(_space_arcs(d))
    out = []
    i, cmd = 0, None
    cx = cy = sx = sy = 0.0
    # The last control point, and which family it came from: S reflects only
    # after C/S, T only after Q/T. One shared variable would let a Q feed an S.
    px = py = None
    prev = None                                    # "cubic" | "quad" | None
    cur = None
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]
            i += 1
        if cmd is None:
            break
        up = cmd.upper()
        rel = cmd != up
        n = _ARGS[up]
        a = [float(v) for v in toks[i:i + n]]
        if len(a) < n:
            break
        i += n
        if up == "M":
            cx, cy = (cx + a[0], cy + a[1]) if rel else (a[0], a[1])
            sx, sy = cx, cy
            cur = {"pts": [(cx, cy)], "closed": False, "cmds": 1}
            out.append(cur)
            cmd = "l" if rel else "L"              # an implicit repeat of M is a lineto
            px = py = prev = None
            continue
        if cur is None:
            cur = {"pts": [(0.0, 0.0)], "closed": False, "cmds": 1}
            out.append(cur)
        cur["cmds"] += 1
        if up == "Z":
            cur["closed"] = True
            cur["pts"].append((sx, sy))
            cx, cy = sx, sy
            px = py = prev = None
            continue
        p0 = (cx, cy)
        if up == "L":
            cx, cy = (cx + a[0], cy + a[1]) if rel else (a[0], a[1])
            cur["pts"].append((cx, cy))
            px = py = prev = None
        elif up == "H":
            cx = cx + a[0] if rel else a[0]
            cur["pts"].append((cx, cy))
            px = py = prev = None
        elif up == "V":
            cy = cy + a[0] if rel else a[0]
            cur["pts"].append((cx, cy))
            px = py = prev = None
        elif up in ("C", "S"):
            if up == "C":
                c1 = (cx + a[0], cy + a[1]) if rel else (a[0], a[1])
                c2 = (cx + a[2], cy + a[3]) if rel else (a[2], a[3])
                end = (cx + a[4], cy + a[5]) if rel else (a[4], a[5])
            else:
                c1 = (2 * cx - px, 2 * cy - py) if prev == "cubic" else (cx, cy)
                c2 = (cx + a[0], cy + a[1]) if rel else (a[0], a[1])
                end = (cx + a[2], cy + a[3]) if rel else (a[2], a[3])
            _cubic(p0, c1, c2, end, cur["pts"])
            px, py = c2
            prev = "cubic"
            cx, cy = end
        elif up in ("Q", "T"):
            if up == "Q":
                c1 = (cx + a[0], cy + a[1]) if rel else (a[0], a[1])
                end = (cx + a[2], cy + a[3]) if rel else (a[2], a[3])
            else:
                c1 = (2 * cx - px, 2 * cy - py) if prev == "quad" else (cx, cy)
                end = (cx + a[0], cy + a[1]) if rel else (a[0], a[1])
            _quad(p0, c1, end, cur["pts"])
            px, py = c1
            prev = "quad"
            cx, cy = end
        elif up == "A":
            end = (cx + a[5], cy + a[6]) if rel else (a[5], a[6])
            _arc(p0, a[0], a[1], a[2], bool(int(a[3])), bool(int(a[4])), end, cur["pts"])
            cx, cy = end
            px = py = prev = None
    return [s for s in out if len(s["pts"]) > 1]


def _sharp(pts, closed):
    """Indices of the polyline's own corners: a turn of more than 40 degrees.

    Measured on the source, before anything is displaced, so a wobble can
    neither invent a corner nor rub one out. A flattened curve turns by a
    degree or two between neighbours; only a real corner comes near 40.
    """
    n = len(pts)
    out = []
    for i in range(n):
        if not closed and (i == 0 or i == n - 1):
            continue
        a, b, c = pts[(i - 1) % n], pts[i], pts[(i + 1) % n]
        v1 = (b[0] - a[0], b[1] - a[1])
        v2 = (c[0] - b[0], c[1] - b[1])
        l1, l2 = math.hypot(*v1), math.hypot(*v2)
        if l1 < 1e-6 or l2 < 1e-6:
            continue
        if (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2) < _COS40:
            out.append(i)
    return out


def _resample(pts, step, closed):
    """Walk a polyline at equal arc-length intervals, landing on every corner.

    Equal intervals alone will step straight past a corner — the corner is
    simply not among the samples, and the spline joins the sample before it to
    the sample after, cutting it off. On a chart frame that is a rectangle with
    its four corners planed to 45-degree bevels. So the corners are put into the
    sample set explicitly, and their positions come back with them.

    Returns (samples, length, sharp) where `sharp` marks the samples that are
    corners and must not be smoothed through.
    """
    seg = [0.0]
    for a, b in zip(pts, pts[1:]):
        seg.append(seg[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    total = seg[-1]
    if total <= 0:
        return [pts[0]], 0.0, [False]

    n = max(3, round(total / step))
    wanted = [(total * k / n, False) for k in range(n + 1)]
    wanted += [(seg[i], True) for i in _sharp(pts, closed)]
    wanted.sort()

    # A corner and an interval sample can land on the same spot; keep the corner.
    merged = []
    for at, is_corner in wanted:
        if merged and at - merged[-1][0] < total * 1e-6:
            if is_corner:
                merged[-1] = (at, True)
            continue
        merged.append((at, is_corner))

    out, sharp, j = [], [], 0
    for at, is_corner in merged:
        while j < len(seg) - 2 and seg[j + 1] < at:
            j += 1
        span = seg[j + 1] - seg[j]
        t = 0.0 if span <= 0 else (at - seg[j]) / span
        a, b = pts[j], pts[j + 1]
        out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        sharp.append(is_corner)
    return out, total, sharp


# ── the noise ────────────────────────────────────────────────────────────────
# Deliberately the same sin-hash the browser prototype used, so what shipped is
# what was reviewed. It is not a good hash; it is a reproducible one.

def _h1(t, seed):
    x = math.sin((t + 1) * 127.1 + seed * 311.7) * 43758.5453
    return (x - math.floor(x)) * 2 - 1


def _noiser(seed):
    def f(t):
        i = math.floor(t)
        fr = t - i
        s = fr * fr * (3 - 2 * fr)
        return _h1(i, seed) * (1 - s) + _h1(i + 1, seed) * s
    return f


def _field(seed, wavelength, amp):
    """One smooth 2-D displacement field, shared by every stroke in a drawing."""
    def h(i, j, s):
        x = math.sin(i * 127.1 + j * 311.7 + (seed + s) * 74.7) * 43758.5453
        return (x - math.floor(x)) * 2 - 1

    def smooth(x, y, s):
        i, j = math.floor(x), math.floor(y)
        fx, fy = x - i, y - j
        u = fx * fx * (3 - 2 * fx)
        v = fy * fy * (3 - 2 * fy)
        return ((h(i, j, s) * (1 - u) + h(i + 1, j, s) * u) * (1 - v)
                + (h(i, j + 1, s) * (1 - u) + h(i + 1, j + 1, s) * u) * v)

    def f(x, y):
        px, py = x / wavelength, y / wavelength
        return smooth(px, py, 0) * amp, smooth(px, py, 53.1) * amp
    return f


# ── drawing it back out ──────────────────────────────────────────────────────

_COS40 = math.cos(math.radians(40))


def _fmt(v):
    return f"{v:.1f}".rstrip("0").rstrip(".") or "0"


def _spline(pts, closed, sharp):
    """Catmull-Rom through the samples → cubics, breaking at every corner.
    Straight linetos between shaken points give visible kinks; a spline gives a
    wavering line, which is the whole point."""
    n = len(pts)
    if n < 3:
        return "M" + "L".join(f"{_fmt(p[0])} {_fmt(p[1])}" for p in pts)
    at = (lambda i: pts[i % n]) if closed else (lambda i: pts[max(0, min(n - 1, i))])
    is_sharp = (lambda i: sharp[i % n]) if sharp else (lambda i: False)
    d = [f"M{_fmt(at(0)[0])} {_fmt(at(0)[1])}"]
    for i in range(n if closed else n - 1):
        p0, p1, p2, p3 = at(i - 1), at(i), at(i + 1), at(i + 2)
        if is_sharp(i) or is_sharp(i + 1):
            d.append(f"L{_fmt(p2[0])} {_fmt(p2[1])}")
            continue
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f"C{_fmt(c1[0])} {_fmt(c1[1])} {_fmt(c2[0])} {_fmt(c2[1])} "
                 f"{_fmt(p2[0])} {_fmt(p2[1])}")
    return "".join(d) + ("Z" if closed else "")


def _one(sub, o, field, seed):
    pts, length = sub["pts"], None
    seg = 0.0
    for a, b in zip(pts, pts[1:]):
        seg += math.hypot(b[0] - a[0], b[1] - a[1])
    length = seg
    if length < o["step"] * 0.5:                   # a tick mark: leave it alone
        return None
    step = min(o["step"], length / max(10, sub["cmds"] * 3))
    samples, _, sharp = _resample(pts, step, sub["closed"])
    nx, ny = _noiser(seed), _noiser(seed + 17.3)
    jitter = o["amp"] * o.get("jitter", 0.25)
    wob = o["wobble"]
    out = []
    for i, p in enumerate(samples):
        wx, wy = field(p[0], p[1])
        out.append((p[0] + wx + (nx(i / wob) * jitter if jitter else 0.0),
                    p[1] + wy + (ny(i / wob) * jitter if jitter else 0.0)))
    if sub["closed"]:                              # make the loop actually close
        mx = (out[0][0] + out[-1][0]) / 2
        my = (out[0][1] + out[-1][1]) / 2
        out[0] = out[-1] = (mx, my)
    return _spline(out, sub["closed"], sharp)


_PATH_D = re.compile(r'(<path\b[^>]*?\bd=")([^"]*)(")')
_CIRCLE = re.compile(r'<circle\b([^>]*?)/>')
_ATTR = re.compile(r'(\w[\w-]*)="([^"]*)"')


def redraw(markup, setting, unit):
    """Re-draw every path and circle in a stroked SVG fragment.

    Attributes other than `d` are carried through untouched — a class still
    colours the stroke, a `data-l` still lights with its label, and the one
    figure that rotates a ghost hull keeps its transform. `<text>` must not be
    passed in: a displaced label is a label you cannot read.
    """
    opt = {"step": setting["step"] * unit, "amp": setting["amp"] * unit,
           "wobble": setting["wobble"], "jitter": setting.get("jitter", 0.25)}
    field = _field(setting["seed"], opt["step"] * opt["wobble"], opt["amp"])
    seed = setting["seed"]

    # A circle is the clearest tell that a line was plotted rather than drawn, so
    # it becomes a path and gets shaken with everything else.
    def circle_to_path(m):
        attrs = dict(_ATTR.findall(m.group(1)))
        cx, cy, r = float(attrs.pop("cx", 0)), float(attrs.pop("cy", 0)), float(attrs.pop("r", 0))
        rest = "".join(f' {k}="{v}"' for k, v in attrs.items())
        d = (f"M{_fmt(cx - r)} {_fmt(cy)}A{_fmt(r)} {_fmt(r)} 0 1 0 {_fmt(cx + r)} {_fmt(cy)}"
             f"A{_fmt(r)} {_fmt(r)} 0 1 0 {_fmt(cx - r)} {_fmt(cy)}Z")
        return f'<path{rest} d="{d}"/>'

    markup = _CIRCLE.sub(circle_to_path, markup)

    def redraw_d(m):
        # The tremble seed counts subpaths *within* one path element and resets
        # for the next, matching the prototype the settings were chosen against.
        # (With the figures' jitter of 0 it changes nothing; the doodles use it.)
        parts = []
        for i, s in enumerate(subpaths(m.group(2))):
            got = _one(s, opt, field, seed + i * 7.3)
            parts.append(got if got else _sub_source(s))
        return m.group(1) + "".join(parts) + m.group(3)

    return _PATH_D.sub(redraw_d, markup)


def _sub_source(sub):
    """A subpath too short to be worth shaking, written back as its polyline."""
    pts = sub["pts"]
    return ("M" + "L".join(f"{_fmt(p[0])} {_fmt(p[1])}" for p in pts)
            + ("Z" if sub["closed"] else ""))
