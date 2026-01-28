
<img width="256" height="256" alt="logo-removebg-preview" src="https://github.com/user-attachments/assets/45f788db-571e-4469-9c27-083fe317eb4b" />


# Python DS Studio


**Python DS Studio** is a high-performance Python Data Science environment for Obsidian. Powered by [Pyodide](https://pyodide.org/), it enables local execution of Python code, advanced data visualization (Matplotlib/Seaborn/Plotly), and dynamic package management directly within your vault.


## Features

### Core Execution
- **In-Browser Runtime**: Executes Python 3.11+ via WebAssembly. Zero local installation required.
- **Web Worker Support**: Non-blocking UI with Python execution in a separate thread.
- **First-run Warning**: Informative notification for initial environment setup.

### Data Visualization
- **Matplotlib & Seaborn**: Native support with automatic plot rendering in markdown notes.
- **Plotly Interactive Charts**: Full support for interactive Plotly visualizations including:
    - `plotly.express` (px.scatter, px.line, px.bar, px.imshow, etc.)
    - `plotly.graph_objects` (go.Figure, go.Scatter, go.Contour, etc.)
    - Fullscreen mode for charts
    - Save charts as HTML files
    - Embedded responsive iframes

### Data Studio Interface
Dedicated sidebar for advanced workflows:
- **Variable Explorer**: 
    - Inspect and modify active memory (DataFrames, dicts, lists)
    - Add, rename, and delete variables inline
    - Real-time refresh
- **DataFrame Viewer**: 
    - Paginated table view with filtering
    - Data operations (Drop NA, Fill NA, Drop Duplicates)
    - Statistical analysis (Describe, Correlation)
    - Export to CSV, JSON, Markdown, or Clipboard
- **Package Manager**: 
    - Runtime installation via `micropip` (scipy, scikit-learn, etc.)
    - Memorized packages (session-based)
    - Autoload packages (persistent across sessions)
- **Integrated Output**: 
    - Persistent execution logs and output history
    - Run All blocks without clearing output
    - Clear individual or all logs
- **Split View**: Parallel workspace for Output and Variables.

### Advanced Interactivity
- Drag-and-drop execution results into notes
- Reorderable code blocks within the Studio
- Real-time environment reset (Flush Memory)
- Code execution in Reading Mode

### Image & Chart Management
- **Image Save Modes**:
    - Base64 (embedded in Markdown)
    - Specific folder
    - Root of current note
    - Ask every time
- **Plotly HTML Export**: Save interactive charts as standalone HTML files

### Integration
- Automatic "Run" and "Studio" triggers on `python` code blocks
- Full functionality in Reading Mode
- Multi-language support (EN, FR, ES, DE, IT)
- GitHub integration for plugin updates
- **Showcase & Test Suite**: Downloadable test suite from settings to explore all features.

## Obsidian API (Python Bridge)

The plugin provides a built-in `obsidian` module to interact with your vault directly from Python.

### File Operations
- `await obsidian.read_file(path)`: Read text content.
- `await obsidian.read_json(path)`: Read and parse JSON.
- `await obsidian.read_csv(path)`: Read CSV as a Pandas DataFrame (if pandas is installed).
- `await obsidian.write_file(path, content)`: Write text content.
- `await obsidian.write_json(path, data)`: Write dict/DataFrame as JSON.
- `await obsidian.write_csv(path, data)`: Write DataFrame/list as CSV.
- `await obsidian.create(path, content)`: Create a new file.
- `await obsidian.delete_file(path)`: Delete a file (moves to trash).
- `await obsidian.file_exists(path)`: Check if a file exists.

### Vault Exploration
- `await obsidian.list_files(folder, extension)`: List files in a folder.
- `await obsidian.search(query)`: Search for text across all markdown files.
- `await obsidian.create_folder(path)`: Create a folder recursively.

### Metadata (Frontmatter)
- `await obsidian.get_frontmatter(path)`: Get YAML metadata.
- `await obsidian.update_frontmatter(path, data)`: Update or add YAML fields.

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

### Plotly Charts

```python
import plotly.express as px

df = px.data.iris()
fig = px.scatter(df, x="sepal_width", y="sepal_length", color="species")
fig.show()
```

### Data Studio
Access the **Python DS Studio** via the ribbon icon (`activity`).

- **Output**: Full execution history.
- **Variables**: Real-time memory inspection and inline editing.
- **Packages**: Dynamic library installation. *Note: Supports pure Python wheels or Pyodide-compiled packages.*

## Configuration

### Settings
- **Image Save Mode**: Configure how generated plots are stored (Base64, specific folder, or root).
- **Image Folder Path**: Custom folder for saved images.
- **Autoload Packages**: Define persistent libraries to load on environment initialization.
- **Language**: Choose interface language (EN, FR, ES, DE, IT).
- **Download Showcase**: Download a comprehensive test suite to explore all features.

## Supported Libraries

Pre-installed:
- `numpy`, `pandas`, `matplotlib`, `scikit-learn`, `seaborn`, `plotly`

Available via micropip:
- `scipy`, `statsmodels`, `networkx`, and many more pure Python packages

## Development

1. Clone repository.
2. `npm install`
3. `npm run dev` (watch mode)

## License

MIT License. See [LICENSE](LICENSE) for details.

---
*Powered by [Pyodide](https://pyodide.org/) and [Obsidian](https://obsidian.md/).*
