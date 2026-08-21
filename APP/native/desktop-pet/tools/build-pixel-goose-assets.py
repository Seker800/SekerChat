"""Build WPF animation frames from Duckhive's CC0 pixel-goose spritesheets."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image


PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT / "src" / "SekerChat.DesktopPet" / "Assets" / "PixelGoose" / "Source"
RUNTIME = PROJECT / "src" / "SekerChat.DesktopPet" / "Assets" / "PixelGoose" / "Runtime"
FRAME_SIZE = 64
CROP_BOX = (14, 0, 56, 40)
ANIMATIONS = {
    "Idle": [420, 420],
    "Walk": [150, 150, 150, 150],
    "Run": [90, 90, 90, 90],
    "Flap": [110, 110, 110, 110],
}


def build_animation(name: str, delays: list[int]) -> None:
    source_path = SOURCE / f"{name}.png"
    output = RUNTIME / name
    output.mkdir(parents=True, exist_ok=True)

    with Image.open(source_path) as source:
        sheet = source.convert("RGBA")
        expected_width = FRAME_SIZE * len(delays)
        if sheet.size != (expected_width, FRAME_SIZE):
            raise ValueError(
                f"Unexpected {name} spritesheet size: {sheet.size}; "
                f"expected {(expected_width, FRAME_SIZE)}"
            )

        for index in range(len(delays)):
            frame = sheet.crop(
                (index * FRAME_SIZE, 0, (index + 1) * FRAME_SIZE, FRAME_SIZE)
            ).crop(CROP_BOX)
            frame.save(output / f"frame-{index:03d}.png", optimize=True)

    (output / "animation.json").write_text(
        json.dumps({"Delays": delays}, separators=(",", ":")),
        encoding="utf-8",
    )


def main() -> None:
    if RUNTIME.exists():
        shutil.rmtree(RUNTIME)
    RUNTIME.mkdir(parents=True)
    for name, delays in ANIMATIONS.items():
        build_animation(name, delays)
    print(f"Built {len(ANIMATIONS)} pixel-goose animations in {RUNTIME}")


if __name__ == "__main__":
    main()
