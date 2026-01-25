
<img width="256" height="256" alt="logo-removebg-preview" src="https://github.com/user-attachments/assets/45f788db-571e-4469-9c27-083fe317eb4b" />

# Python DS Studio

**Python DS Studio** is a high-performance Python Data Science environment for Obsidian. Powered by [Pyodide](https://pyodide.org/), it enables local execution of Python code, advanced data visualization (Matplotlib/Seaborn), and dynamic package management directly within your vault.


## Features

- **In-Browser Runtime**: Executes Python 3.11+ via WebAssembly. Zero local installation required.
- **Data Visualization**: Native support for `matplotlib` and `seaborn`. Renders plots directly in markdown notes.
- **Data Studio Interface**: Dedicated sidebar for advanced workflows:
    - **Variable Explorer**: Inspect and modify active memory (DataFrames, dicts, lists).
    - **Package Manager**: Runtime installation via `micropip` (scipy, scikit-learn, etc.).
    - **Integrated Console**: Persistent execution logs and output history.
    - **Split View**: Parallel workspace for Console and Variables.
- **Advanced Interactivity**: 
    - Drag-and-drop execution results into notes.
    - Reorderable code blocks within the Studio.
    - Real-time environment reset (Flush Memory).
- **Seamless Integration**:
    - Automatic "Run" and "Studio" triggers on `python` code blocks.
    - Full functionality in Reading Mode.
    - Multi-language support (EN, FR, ES, DE, IT).

## Installation

### Manual
1. Download the latest release from [GitHub](https://github.com/infinition/obsidian-python-ds-studio/releases).
2. Extract `main.js`, `styles.css`, and `manifest.json` to `.obsidian/plugins/obsidian-python-ds-studio/`.
3. Enable the plugin in Obsidian settings.

### BRAT
1. Install the **BRAT** plugin.
2. Add the repository URL: `https://github.com/infinition/obsidian-python-ds-studio`
3. Enable the plugin.

## Usage

### Execution
Define a standard Python code block:

```python
import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 10, 100)
y = np.sin(x)

plt.plot(x, y)
plt.show()
```

- **Run**: Executes the block and injects output below.
- **Studio**: Sends the block to the sidebar for persistent experimentation.

### Data Studio
Access the **Python DS Studio** via the ribbon icon (`activity`).

- **Console**: Full execution history.
- **Variables**: Real-time memory inspection and inline editing.
- **Packages**: Dynamic library installation. *Note: Supports pure Python wheels or Pyodide-compiled packages.*

## Configuration

### Environment
- **Image Save Mode**: Configure how generated plots are stored (Base64, specific folder, or root).
- **Autoload Packages**: Define persistent libraries to load on environment initialization.

## Development

1. Clone repository.
2. `npm install`
3. `npm run dev` (watch mode)

## License

MIT License. See [LICENSE](LICENSE) for details.

---
*Powered by [Pyodide](https://pyodide.org/) and [Obsidian](https://obsidian.md/).*
