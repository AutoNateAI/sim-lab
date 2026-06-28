# Capture checklist

- Use a fixed viewport and device scale.
- Run headed unless CI or the user explicitly requires headless execution.
- Record the exact URL and scenario in `run-log.md`.
- Wait for the simulation root and result state, not an arbitrary long timeout.
- Capture the full simulation panel for context; add focused crops only when they teach a distinct step.
- Use numbered filenames in tutorial order.
- Exclude personal accounts, tokens, browser chrome, and unrelated tabs.
- Re-run after material UI or model changes.
- Persist scenario inputs and observed output metrics as JSON.
- Check every Markdown image link and inspect images at full resolution.
