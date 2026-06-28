# Exporter lineage

The initial exporter came from the sibling repository at `power-money-maps/scripts/export_readme_pdf.py`.

Sim Lab's version keeps its Pandoc → Typst pipeline and validation standard, but replaces hardcoded Power Money Maps paths, titles, Mermaid cache paths, and output names with command-line arguments. It also copies article images into a self-contained PDF package.
