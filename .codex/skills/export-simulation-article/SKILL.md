---
name: export-simulation-article
description: Export Sim Lab Markdown tutorials, ODD protocols, and articles to polished AutoNateAI-branded PDFs with Typst. Use when a simulation article needs a printable or shareable PDF, when screenshots must be packaged into a handout, or when validating a generated PDF artifact.
---

# Export Simulation Article

Create a PDF next to the simulation source and keep it reproducible.

## Workflow

1. Confirm the source article is learner-facing and its local images resolve.
2. Run the bundled exporter from the repository root:

```bash
python3 .codex/skills/export-simulation-article/scripts/export_article_pdf.py \
  simulations/<industry>/<simulation>/tutorial.md \
  --title "Tutorial title" \
  --output simulations/<industry>/<simulation>/pdf/tutorial.pdf
```

3. Keep generated source and copied images in the article's `pdf/` folder.
4. Verify with `pdfinfo`, `pdftotext`, and a rendered first page from `pdftoppm`.
5. Visually inspect the rendered page. Do not report success from compilation alone.

## Standards

- Use `AutoNateAI` as author and brand unless explicitly told otherwise.
- Preserve the article's information; edit source rather than silently dropping unsupported content.
- Use actual browser captures, not invented interface mockups.
- Keep tables readable and code in a monospaced treatment.
- Treat Mermaid as a pre-rendering requirement. Render diagrams to PNG before export when present.

The exporter is adapted from `power-money-maps/scripts/export_readme_pdf.py`; see `references/lineage.md` for the changes.
