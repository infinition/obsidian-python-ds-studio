<img width="402" height="401" alt="image-removebg-preview (13)" src="https://github.com/user-attachments/assets/4ee73eec-13a3-492b-86dc-6a4bbd805013" />

# Python DS Studio for Obsidian

[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white) [![Release](https://img.shields.io/github/v/release/infinition/obsidian-python-ds-studio?style=flat)](https://github.com/infinition/obsidian-python-ds-studio/releases) [![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-7C3AED?style=flat&logo=obsidian&logoColor=white)](https://obsidian.md/plugins?id=python-ds-studio) [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=flat&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/infinition)

A Python data science environment inside Obsidian, powered by Pyodide (Python 3.11+ via WebAssembly). Run Python code blocks directly in your notes without installing anything locally.

Plugin ID: `python-ds-studio`

---

## Features

**Execution**
- In-browser Python runtime via WebAssembly. No local Python install required.
- Web Worker support: Python runs in a separate thread so the UI stays responsive.
- Code blocks in notes: use `python` fenced blocks and click Run, or send to the sidebar Studio.

**Visualization**
- Matplotlib and Seaborn: plots render inline in the note.
- Plotly: full support for `plotly.express` and `plotly.graph_objects`. Charts are interactive, can be viewed fullscreen, and saved as HTML.

**Data Studio sidebar**
- Output tab: full execution history.
- Variables tab: real-time memory inspection and inline editing.
- Packages tab: dynamic package installation via micropip.

**Pre-installed libraries**: numpy, pandas, matplotlib, scikit-learn, seaborn, plotly.

**Additional packages** available via micropip: scipy, statsmodels, networkx, and any Pyodide-compatible pure Python wheel.

---

## Settings

| Setting | Description |
|---------|-------------|
| Image Save Mode | Base64, specific folder, or vault root |
| Image Folder Path | Custom folder for saved plots |
| Autoload Packages | Libraries loaded on environment start |
| Language | EN, FR, ES, DE, IT |
| Download Showcase | A test suite covering all features |

---

## Development

```bash
npm install
npm run dev
npm run build
```

---

## Star History

<a href="https://www.star-history.com/?repos=infinition%2Fobsidian-python-ds-studio&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=infinition/obsidian-python-ds-studio&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=infinition/obsidian-python-ds-studio&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=infinition/obsidian-python-ds-studio&type=date&legend=top-left" />
 </picture>
</a>

---

## License

MIT. See [LICENSE](LICENSE).
