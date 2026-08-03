#!/usr/bin/env python3
"""Import 300 clean Lucide outlines into Split's deterministic doodle pipeline.

The imported geometry is centered and scaled from Lucide's 24-unit viewBox to
Split's 32-unit box. `build.py` then applies the same seeded roughening used by
every native doodle. Lucide's ISC license is preserved in LUCIDE-LICENSE.txt.
"""

import argparse
import csv
import json
import os
import re
import xml.etree.ElementTree as ET

import rough

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "expense-subjects.tsv")
DEFAULT_OUT = os.path.join(HERE, "parts", "14-expense-subjects.json")
SCALE = 1.2
OFFSET = 1.6


def number(value):
    return float(value) if value is not None else 0.0


def points(value):
    values = [float(item) for item in re.findall(r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?", value)]
    return list(zip(values[::2], values[1::2]))


def element_path(element):
    tag = element.tag.rsplit("}", 1)[-1]
    attrs = element.attrib
    if tag == "path":
        return attrs.get("d", "")
    if tag == "line":
        return "M%s %s L%s %s" % (attrs["x1"], attrs["y1"], attrs["x2"], attrs["y2"])
    if tag in ("polyline", "polygon"):
        shape = points(attrs.get("points", ""))
        if not shape:
            return ""
        data = "M%s %s" % shape[0] + "".join(" L%s %s" % point for point in shape[1:])
        return data + (" Z" if tag == "polygon" else "")
    if tag == "rect":
        x, y = number(attrs.get("x")), number(attrs.get("y"))
        width, height = number(attrs.get("width")), number(attrs.get("height"))
        rx = min(number(attrs.get("rx")), width / 2, height / 2)
        if not rx:
            return f"M{x} {y} H{x + width} V{y + height} H{x} Z"
        return (
            f"M{x + rx} {y} H{x + width - rx} A{rx} {rx} 0 0 1 {x + width} {y + rx} "
            f"V{y + height - rx} A{rx} {rx} 0 0 1 {x + width - rx} {y + height} "
            f"H{x + rx} A{rx} {rx} 0 0 1 {x} {y + height - rx} V{y + rx} A{rx} {rx} 0 0 1 {x + rx} {y} Z"
        )
    if tag == "ellipse":
        cx, cy, rx, ry = map(number, (attrs.get("cx"), attrs.get("cy"), attrs.get("rx"), attrs.get("ry")))
        return f"M{cx - rx} {cy} A{rx} {ry} 0 1 0 {cx + rx} {cy} A{rx} {ry} 0 1 0 {cx - rx} {cy} Z"
    return ""


def fmt(value):
    rounded = round(value, 3)
    return str(int(rounded)) if rounded.is_integer() else ("%.3f" % rounded).rstrip("0").rstrip(".")


def transform_path(data):
    tokens = rough._TOKENS.findall(rough._space_arcs(data))
    output = []
    index, command = 0, None
    while index < len(tokens):
        if tokens[index].isalpha():
            command = tokens[index]
            index += 1
        if command is None:
            break
        upper = command.upper()
        if upper == "Z":
            output.append(command)
            command = None
            continue

        count = rough._ARGS[upper]
        args = [float(value) for value in tokens[index : index + count]]
        if len(args) < count:
            raise ValueError("incomplete SVG command in %s" % data)
        index += count
        absolute = command == upper

        def coordinate(value):
            return value * SCALE + (OFFSET if absolute else 0)

        if upper in ("M", "L", "T"):
            args = [coordinate(args[0]), coordinate(args[1])]
        elif upper == "H":
            args = [coordinate(args[0])]
        elif upper == "V":
            args = [coordinate(args[0])]
        elif upper in ("C", "S", "Q"):
            args = [coordinate(value) for value in args]
        elif upper == "A":
            args = [args[0] * SCALE, args[1] * SCALE, args[2], int(args[3]), int(args[4]), coordinate(args[5]), coordinate(args[6])]

        output.append(command + " ".join(fmt(value) for value in args))
        if upper == "M":
            command = "L" if absolute else "l"
    return " ".join(output)


def import_icon(path):
    root = ET.parse(path).getroot()
    if root.attrib.get("viewBox") != "0 0 24 24":
        raise ValueError("expected a 24-unit Lucide viewBox in %s" % path)

    paths, dots = [], []
    for element in root.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        if tag == "circle":
            dots.append(
                [
                    round(number(element.attrib.get("cx")) * SCALE + OFFSET, 3),
                    round(number(element.attrib.get("cy")) * SCALE + OFFSET, 3),
                    round(number(element.attrib.get("r")) * SCALE, 3),
                ]
            )
            continue
        data = element_path(element)
        if data:
            paths.append(transform_path(data))

    if not paths and not dots:
        raise ValueError("no supported geometry in %s" % path)
    return " ".join(paths), dots


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lucide-dir", required=True, help="path to lucide-static's icons directory")
    parser.add_argument("--out", default=DEFAULT_OUT)
    args = parser.parse_args()

    with open(SOURCE, newline="", encoding="utf-8") as source:
        subjects = list(csv.DictReader(source, delimiter="\t"))
    if len(subjects) != 300:
        raise SystemExit("expected 300 expense subjects, found %d" % len(subjects))

    output = {}
    for subject in subjects:
        icon = subject["icon"]
        doodle = "expense_" + icon.replace("-", "_")
        svg = os.path.join(os.path.abspath(args.lucide_dir), icon + ".svg")
        if not os.path.exists(svg):
            raise SystemExit("missing Lucide source: " + svg)
        path, dots = import_icon(svg)
        entry = {
            "d": path,
            "note": "%s — specific expense subject; clean geometry derived from Lucide %s" % (subject["label"], icon),
            "source": "lucide-static@1.28.0/icons/%s.svg" % icon,
        }
        if dots:
            entry["dots"] = dots
        output[doodle] = entry

    if len(output) != 300:
        raise SystemExit("expense subjects must use 300 distinct source icons")
    with open(args.out, "w", encoding="utf-8") as destination:
        json.dump(dict(sorted(output.items())), destination, ensure_ascii=False, indent=2)
        destination.write("\n")
    print("wrote : %s (%d imported drawings)" % (args.out, len(output)))


if __name__ == "__main__":
    main()
