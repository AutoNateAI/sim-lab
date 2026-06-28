#!/usr/bin/env python3
"""Export a simulation Markdown article to a branded Typst PDF."""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
from pathlib import Path


def run(*args: str, cwd: Path | None = None) -> None:
    subprocess.run(args, cwd=cwd, check=True)


def typst_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--title")
    parser.add_argument("--subtitle", default="Simulation tutorial and reproducibility guide")
    args = parser.parse_args()

    missing = [tool for tool in ("pandoc", "typst") if shutil.which(tool) is None]
    if missing:
        raise SystemExit(f"Missing required tools: {', '.join(missing)}")

    source = args.source.resolve()
    output = args.output.resolve()
    if not source.exists():
        raise SystemExit(f"Source does not exist: {source}")
    output.parent.mkdir(parents=True, exist_ok=True)
    build = output.parent / "build"
    assets = output.parent / "assets"
    build.mkdir(exist_ok=True)
    assets.mkdir(exist_ok=True)
    theme = output.parent / "theme.typ"
    bundled_theme = Path(__file__).resolve().parents[1] / "assets" / "theme.typ"
    if not theme.exists():
        shutil.copy2(bundled_theme, theme)

    text = source.read_text(encoding="utf-8")
    text = re.sub(r"\A---\n.*?\n---\n", "", text, count=1, flags=re.DOTALL)
    if "```mermaid" in text:
        raise SystemExit("Mermaid detected. Render diagrams to PNG and replace the block before PDF export.")

    def copy_image(match: re.Match[str]) -> str:
        alt, link = match.group(1), match.group(2)
        if re.match(r"https?://", link):
            return match.group(0)
        image = (source.parent / link).resolve()
        if not image.exists():
            raise SystemExit(f"Missing article image: {image}")
        target = assets / image.name
        shutil.copy2(image, target)
        return f"![{alt}](assets/{target.name})"

    prepared = re.sub(r"!\[([^]]*)\]\(([^)]+)\)", copy_image, text)
    prepared_md = build / f"{source.stem}.prepared.md"
    body_typ = build / f"{source.stem}.body.typ"
    source_typ = output.parent / f"{source.stem}.typ"
    prepared_md.write_text(prepared, encoding="utf-8")
    run("pandoc", str(prepared_md), "--from=gfm", "--to=typst", "--wrap=none", "--output", str(body_typ))

    title = args.title or source.stem.replace("-", " ").title()
    body = body_typ.read_text(encoding="utf-8")
    wrapper = f'''#import "theme.typ": publication
#show: publication.with(
  title: "{typst_string(title)}",
  subtitle: "{typst_string(args.subtitle)}",
)

{body}
'''
    source_typ.write_text(wrapper, encoding="utf-8")
    run("typst", "compile", str(source_typ), str(output), "--root", str(output.parent))
    print(f"Created {output}")


if __name__ == "__main__":
    main()
