from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (
    ROOT
    / "src"
    / "SekerChat.DesktopPet"
    / "Assets"
    / "PixelGoose"
    / "Runtime"
    / "Idle"
    / "frame-000.png"
)
OUTPUT_DIR = ROOT / "src" / "SekerChat.DesktopPet" / "Assets"
PNG_OUTPUT = OUTPUT_DIR / "AppIcon.png"
ICO_OUTPUT = OUTPUT_DIR / "AppIcon.ico"
ICON_SIZES = (16, 20, 24, 32, 40, 48, 64, 128, 256)


def build_icon() -> Image.Image:
    source = Image.open(SOURCE).convert("RGBA")
    bounds = source.getbbox()
    if bounds is None:
        raise RuntimeError(f"Icon source is empty: {SOURCE}")

    character = source.crop(bounds)
    canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((5, 5, 250, 250), radius=58, fill="#5B8DEF")

    scale = min(222 / character.width, 222 / character.height)
    character = character.resize(
        (
            round(character.width * scale),
            round(character.height * scale),
        ),
        Image.Resampling.NEAREST,
    )
    x = (canvas.width - character.width) // 2
    y = (canvas.height - character.height) // 2 + 3
    canvas.alpha_composite(character, (x, y))
    return canvas


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    icon = build_icon()
    icon.save(PNG_OUTPUT)
    icon.save(ICO_OUTPUT, format="ICO", sizes=[(size, size) for size in ICON_SIZES])
    print(f"Generated {ICO_OUTPUT}")


if __name__ == "__main__":
    main()
