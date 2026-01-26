
---

This document serves as a comprehensive **feature showcase** and a **functional test suite** for the **Python DS Studio** plugin. It is designed to guide Data Scientists through the capabilities of the environment, from visualization to deep Vault integration.

---

## 📑 Table of Contents

- [[#0. 🚀 Environment Setup (Run First)|0. 🚀 Environment Setup]]
- [[#0.1 📓 Interactive Execution (Notebook Style)|0.1 📓 Interactive Execution]]
    - [[#0.1.1 Step 1: Imports and Data Definition|0.1.1 Step 1: Imports and Data Definition]]
    - [[#0.1.2 Step 2: Data Processing|0.1.2 Step 2: Data Processing]]
- [[#1. 📈 Static Data Visualization|1. 📈 Static Data Visualization]]
    - [[#1.1 Statistical Visualization (Seaborn)|1.1 Statistical Visualization (Seaborn)]]
    - [[#1.2 Mathematical Functions (Matplotlib)|1.2 Mathematical Functions (Matplotlib)]]
    - [[#1.3 Distribution Analysis (Seaborn JointGrid)|1.3 Distribution Analysis (Seaborn JointGrid)]]
- [[#2. 📊 Interactive Charts (Plotly)|2. 📊 Interactive Charts (Plotly)]]
    - [[#2.1 Interactive 3D Surface|2.1 Interactive 3D Surface]]
    - [[#2.2 Animated 3D Scatter (Time Evolution)|2.2 Animated 3D Scatter (Time Evolution)]]
    - [[#2.3 Interactive Correlation Heatmap|2.3 Interactive Correlation Heatmap]]
- [[#3. 🧠 Machine Learning & Exploration|3. 🧠 Machine Learning & Exploration]]
    - [[#3.1 DataFrame Inspection|3.1 DataFrame Inspection]]
    - [[#3.2 K-Means Clustering|3.2 K-Means Clustering]]
- [[#4. 🌐 External Data Loading|4. 🌐 External Data Loading]]
- [[#5. 📦 Package Management|5. 📦 Package Management]]
    - [[#5.1 Installing Packages at Runtime|5.1 Installing Packages at Runtime]]
- [[#6. 🗄️ Obsidian Vault API (The Bridge)|6. 🗄️ Obsidian Vault API (The Bridge)]]
    - [[#6.0 📚 API Reference|6.0 📚 API Reference]]
    - [[#6.1 Checking Existence & Reading Files|6.1 Checking Existence & Reading Files]]
    - [[#6.2 Writing and Creating Files|6.2 Writing and Creating Files]]
    - [[#6.3 Exporting Data (JSON & CSV)|6.3 Exporting Data (JSON & CSV)]]
    - [[#6.4 Frontmatter (Metadata) Operations|6.4 Frontmatter (Metadata) Operations]]
    - [[#6.5 File Deletion Workflow|6.5 File Deletion Workflow]]
- [[#7. 🚀 Complete Data Pipeline|7. 🚀 Complete Data Pipeline]]

---

# 0. 🚀 Environment Setup (Run First)

> [!important] **INITIALIZATION REQUIRED**
> 
> Please execute the code block below **before running any other examples**.
> 
> It automates the creation of:
> 
> 1. A working directory structure (`DS_Studio/`).
>     
> 2. Synthetic datasets (`sales_data.csv`, `employees.csv`) used in later sections.
>     
> 3. Markdown files for metadata manipulation tests.
> 
> **Note:** The first run may take several seconds as the Python environment (Pyodide) needs to be initialized and base packages loaded.



```python
import obsidian
import pandas as pd
import numpy as np
import json
import random

print("🚀 Initializing DS Studio Environment...")

# 1. Define Directory Structure
base_dirs = [
    "DS_Studio",
    "DS_Studio/Projects",
    "DS_Studio/datasets",
    "DS_Studio/outputs"
]

# 2. Create Directories
print("\n--- 📁 Creating Folders ---")
for d in base_dirs:
    try:
        # Recursive creation is handled by the plugin
        await obsidian.create_folder(d)
        print(f"✅ Verified/Created: {d}")
    except Exception as e:
        print(f"ℹ️ Folder info: {d} ({e})")

# 3. Generate 'sales_data.csv'
print("\n--- 📊 Generating Sales Dataset ---")
np.random.seed(42)
sales_df = pd.DataFrame({
    'Date': pd.date_range(start='2023-01-01', periods=50, freq='W'),
    'Region': np.random.choice(['North', 'South', 'East', 'West'], 50),
    'Product': np.random.choice(['Alpha', 'Beta', 'Gamma'], 50),
    'Sales': np.random.randint(100, 1000, size=50),
    'Units': np.random.randint(1, 20, size=50)
})
sales_path = "DS_Studio/datasets/sales_data.csv"
await obsidian.write_csv(sales_path, sales_df)
print(f"✅ Generated: {sales_path} ({len(sales_df)} rows)")

# 4. Generate 'employees.csv'
print("\n--- 👥 Generating Employees Dataset ---")
emp_df = pd.DataFrame({
    'EmployeeID': [f"E{i:03d}" for i in range(1, 31)],
    'Name': [f"Employee {i}" for i in range(1, 31)],
    'Department': np.random.choice(['HR', 'Engineering', 'Sales', 'Marketing'], 30),
    'Age': np.random.randint(22, 60, size=30),
    'Performance': np.random.uniform(1, 5, size=30).round(1)
})
emp_path = "DS_Studio/datasets/employees.csv"
await obsidian.write_csv(emp_path, emp_df)
print(f"✅ Generated: {emp_path} ({len(emp_df)} rows)")

# 5. Generate a Markdown file for Frontmatter tests
print("\n--- 📝 Generating Markdown Test File ---")
md_content = """---
status: pending
last_analysis: null
model_accuracy: 0.0
tags: [test, initial]
---

# Test Project
This is a test file for metadata manipulation via Python.
"""
md_path = "DS_Studio/Projects/metadata_test.md"
# Use write (overwrite) to ensure clean state
await obsidian.write_file(md_path, md_content) 
print(f"✅ Generated: {md_path}")

print("\n✨ Environment setup complete! You can now proceed with the examples below.")
```

---

# 0.1 📓 Interactive Execution (Notebook Style)

The Python environment persists across different code blocks within the same session. This allows you to run your code piece by piece, just like a Data Science notebook. 

## 0.1.1 Step 1: Imports and Data Definition
Run this block to import libraries and define a variable.

```python
import pandas as pd
import numpy as np

# Define a shared variable
shared_data = {"A": [1, 2, 3], "B": [4, 5, 6]}
print("✅ Imports done and 'shared_data' defined.")
```

You can see and also edit all the variables from your executed codes in the "Variables" tab of the Python DS Studio panel.

## 0.1.2 Step 2: Data Processing
Run this block to use the variable defined in the previous step.

```python
# Create a DataFrame from the shared variable
df_shared = pd.DataFrame(shared_data)
df_shared["C"] = df_shared["A"] + df_shared["B"]
print("✅ DataFrame created and processed using 'shared_data'.")
print(df_shared)
```

In the variable tab you can now open your dataframe in a powerfull dataset editor by cliking on the view icon.

---

# 1. 📈 Static Data Visualization

Standard visualization libraries like **Seaborn** and **Matplotlib** are fully supported. Charts are rendered directly in the note as PNG images.

> [!tip] **Image Storage Options**
> You can configure where generated images are saved in the plugin settings:
> - **Base64**: Encoded directly within the Markdown file (no external files).
> - **Vault Root**: Saved at the root of your Obsidian vault.
> - **Specific Folder**: Saved in a folder of your choice (e.g., `DS_Studio/outputs`).
> - **Ask Every Time**: Prompts you for a location whenever a chart is generated.

## 1.1 Statistical Visualization (Seaborn)

Python

```python
import seaborn as sns
import matplotlib.pyplot as plt

# Set aesthetic style
sns.set_theme(style="whitegrid")

# Load diamonds dataset
diamonds = sns.load_dataset("diamonds")

# Draw scatter plot
f, ax = plt.subplots(figsize=(8, 6))
sns.despine(f, left=True, bottom=True)
clarity_ranking = ["I1", "SI2", "SI1", "VS2", "VS1", "VVS2", "VVS1", "IF"]
sns.scatterplot(x="carat", y="price",
                hue="clarity", size="depth",
                palette="ch:r=-.2,d=.3_r",
                hue_order=clarity_ranking,
                sizes=(1, 8), linewidth=0,
                data=diamonds, ax=ax)

plt.title("Diamond Price vs Carat (Clarity & Depth)")
plt.show()
```

## 1.2 Mathematical Functions (Matplotlib)

Python

```python
import numpy as np
import matplotlib.pyplot as plt

# Generate data
x = np.linspace(0, 2 * np.pi, 400)
y1 = np.sin(x**2)
y2 = np.cos(x)

# Create plot with dark theme (fits Obsidian dark mode)
plt.figure(figsize=(10, 5), facecolor='#1e1e1e')
ax = plt.axes()
ax.set_facecolor('#1e1e1e')

plt.plot(x, y1, color='#00ff00', label='sin(x²)', linewidth=2)
plt.plot(x, y2, color='#ff00ff', label='cos(x)', linestyle='--', linewidth=2)

# Styling
plt.title("Waveform Analysis", color='white', fontsize=14)
plt.legend()
plt.grid(color='#444444', linestyle=':')
ax.tick_params(colors='white')

plt.show()
```

## 1.3 Distribution Analysis (Seaborn JointGrid)




```python
import seaborn as sns
import matplotlib.pyplot as plt

sns.set_theme(style="dark")
df = sns.load_dataset("penguins")

# Create a multi-plot grid
g = sns.JointGrid(data=df, x="body_mass_g", y="bill_depth_mm", space=0)
g.plot_joint(sns.kdeplot, fill=True, clip=((2200, 6800), (10, 25)), thresh=0, levels=100, cmap="rocket")
g.plot_marginals(sns.histplot, color="#03051A", alpha=1, bins=25)

plt.show()
```


---

# 2. 📊 Interactive Charts (Plotly)

Interactive charts allow **zooming, panning, and hovering**. They are rendered as interactive HTML widgets directly within Obsidian. Hover over the charts to see the interactive controls.

## 2.1 Interactive 3D Surface

Python

```python
import plotly.graph_objects as go
import numpy as np

# Generate 3D surface data
x = np.linspace(-5, 5, 50)
y = np.linspace(-5, 5, 50)
X, Y = np.meshgrid(x, y)
Z = np.sin(np.sqrt(X**2 + Y**2))

# Create interactive surface plot
fig = go.Figure(data=[go.Surface(x=X, y=Y, z=Z, colorscale='Viridis')])

fig.update_layout(
    title="3D Surface Plot (Interactive)",
    scene=dict(xaxis_title="X", yaxis_title="Y", zaxis_title="Z"),
    margin=dict(l=0, r=0, b=0, t=40)
)

fig.show()
```


## 2.2 Animated 3D Scatter (Time Evolution)

Be patient, it could take a few minutes for the animation to generate.

```python
import numpy as np
import plotly.express as px
import pandas as pd

# Generate time-based 3D data
np.random.seed(42)
n_frames = 20
n_points = 200

# Create animation frames
all_data = []
for t in range(n_frames):
    x = np.random.randn(n_points) + np.sin(t / 3)
    y = np.random.randn(n_points) + np.cos(t / 3)
    z = np.random.randn(n_points)
    for i in range(n_points):
        all_data.append({'x': x[i], 'y': y[i], 'z': z[i], 'frame': t})

df = pd.DataFrame(all_data)

fig = px.scatter_3d(
    df, x='x', y='y', z='z',
    animation_frame='frame',
    title="Animated 3D Scatter (Time Evolution)",
    opacity=0.7
)

fig.show()
```








## 2.3 Interactive Correlation Heatmap

Python

```python
import numpy as np
import plotly.express as px

# Generate correlation matrix data
np.random.seed(42)
z = np.random.rand(15, 15)
# Make it symmetric for correlation-like appearance
z = (z + z.T) / 2
np.fill_diagonal(z, 1)

fig = px.imshow(
    z,
    color_continuous_scale="RdBu_r",
    title="Interactive Correlation Heatmap",
    labels=dict(color="Correlation")
)

fig.show()
```





---

# 3. 🧠 Machine Learning & Exploration

## 3.1 DataFrame Inspection

Create a DataFrame. You can also view this in the plugin's "Variables" tab.

Python

```python
import pandas as pd
import numpy as np

# Create a synthetic sales dataset
np.random.seed(42)
data = {
    'Date': pd.date_range(start='2023-01-01', periods=100, freq='D'),
    'Product': np.random.choice(['Alpha', 'Beta', 'Gamma', 'Delta'], 100),
    'Sales': np.random.randint(100, 1000, size=100),
    'Growth': np.random.uniform(-0.1, 0.2, size=100).round(4)
}

df = pd.DataFrame(data)

print("--- Data Summary ---")
print(df.describe())
print(f"\nShape: {df.shape}")
```


## 3.2 K-Means Clustering

Visualization of clustering algorithm.

Python

```python
from sklearn.datasets import make_blobs
from sklearn.cluster import KMeans
import matplotlib.pyplot as plt

# Generate synthetic clusters
X, y = make_blobs(n_samples=300, centers=4, cluster_std=0.60, random_state=0)

# Apply KMeans
kmeans = KMeans(n_clusters=4, random_state=42, n_init=10)
kmeans.fit(X)
y_kmeans = kmeans.predict(X)

# Plot results
plt.figure(figsize=(10, 6))
plt.scatter(X[:, 0], X[:, 1], c=y_kmeans, s=50, cmap='viridis')

# Plot centroids
centers = kmeans.cluster_centers_
plt.scatter(
    centers[:, 0], centers[:, 1],
    s=200, c='red', marker='X', label='Centroids'
)

plt.title("K-Means Clustering")
plt.legend()
plt.show()
```


---

# 4. 🌐 External Data Loading

You can load data directly from the web. Note that some URLs might be blocked by CORS policies.

Python

```python
import pandas as pd

# Load a CSV from a public URL (GitHub Raw)
url = "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv"

try:
    print(f"📥 Fetching: {url}...")
    df = pd.read_csv(url)
    print(f"✅ Loaded {len(df)} rows from remote URL")
    print(df.head(3))
except Exception as e:
    print(f"❌ Network error (likely CORS): {e}")
```


---

# 5. 📦 Package Management

## 5.1 Installing Packages at Runtime

This environment runs in the browser via Pyodide. You can install pure Python packages (wheels) dynamically using `micropip`.

Python

```python
import micropip

async def setup_environment():
    print("--- 📦 Initializing Package Installation ---")
    
    # Example: Installing 'networkx' (Graph theory library)
    package_name = "networkx"
    
    try:
        print(f"⏳ Installing {package_name}...")
        await micropip.install(package_name)
        print(f"✅ {package_name} successfully installed!")
    except Exception as e:
        print(f"❌ Installation failed: {e}")

# Run the installation
await setup_environment()

# Verify by using the package
import networkx as nx
import matplotlib.pyplot as plt

print("📊 Generating test graph...")
G = nx.erdos_renyi_graph(15, 0.3, seed=42)
plt.figure(figsize=(6, 4))
nx.draw(G, with_labels=True, node_color='skyblue', edge_color='#888')
plt.title("NetworkX Graph (Package Installed Dynamically)")
plt.show()
```

---
# 6. 🗄️ Obsidian Vault API (The Bridge)

This section demonstrates the core value of this plugin: **Python code that reads and modifies your Obsidian Vault.** These examples use the `obsidian` module bridge. Most operations are asynchronous and must be `await`ed.

## 6.0 📚 API Reference

Here is the list of all available functions in the `obsidian` module:

### 📖 Reading
- `await obsidian.read_file(path)`: Reads the content of a file as a string.
- `await obsidian.read_json(path)`: Reads and parses a JSON file into a Python dictionary.
- `await obsidian.read_csv(path, **kwargs)`: Reads a CSV file and returns it as a **Pandas DataFrame** (if pandas is installed) or a string.

### ✍️ Writing & Exporting
- `await obsidian.write_file(path, content)`: Writes a string to a file (creates it if it doesn't exist).
- `await obsidian.write_json(path, data)`: Writes a dictionary or DataFrame to a JSON file.
- `await obsidian.write_csv(path, data)`: Writes a DataFrame or string to a CSV file.
- `await obsidian.create(path, content)`: Creates a new file with the given content.
- `await obsidian.export_json(data, path)`: Alias for `write_json`.
- `await obsidian.export_csv(data, path)`: Alias for `write_csv`.

### 📁 File & Folder Management
- `await obsidian.list_files(folder, extension=None)`: Lists all files in a folder, optionally filtered by extension.
- `await obsidian.file_exists(path)`: Checks if a file or folder exists.
- `await obsidian.create_folder(path)`: Creates a new folder (recursively if needed).
- `await obsidian.delete_file(path)`: Deletes a file or folder (moves it to the trash).

### 🔍 Search & Metadata
- `await obsidian.search(query)`: Searches for the given text across all markdown files in the vault.
- `await obsidian.get_frontmatter(path)`: Gets the YAML frontmatter of a markdown file as a dictionary.
- `await obsidian.read_frontmatter(path)`: Alias for `get_frontmatter`.
- `await obsidian.update_frontmatter(path, data)`: Updates or adds keys to the YAML frontmatter of a markdown file.

## 6.1 Checking Existence & Reading Files

We will check for the file generated in Step 0.


```python
import obsidian

target_file = "DS_Studio/datasets/sales_data.csv"

# 1. Check if file exists
print(f"🔍 Checking existence of: {target_file}")
exists = await obsidian.file_exists(target_file)

if exists:
    print("✅ File found!")
    
    # 2. Read file content
    content = await obsidian.read_csv(target_file)
    print(f"📄 Read {len(content)} bytes.")
    print(f"📝 First 100 chars:\n{content[:100]}...")
else:
    print("❌ File not found. Please run Step 0 at the top of this note.")
```

## 6.2 Writing and Creating Files

Creating a new markdown report based on python strings.


```python

# Create a new markdown analysis file
content = """# Automated Analysis

Generated via Python DS Studio.
- Status: **Success**
- Mode: Automated
- Timestamp: 2024-01-01
"""

path = "DS_Studio/outputs/auto_analysis.md"

try:
    # 'create' fails if file exists
    success = await obsidian.create(path, content)
    print(f"✅ Created: {path}" if success else "❌ Creation failed")
except Exception as e:
    # 'write' overwrites if file exists
    print(f"ℹ️ File exists, overwriting...")
    await obsidian.write_file(path, content)
    print(f"✅ Overwritten: {path}")
```

## 6.3 Exporting Data (JSON & CSV)

Directly exporting Python structures (Dicts, DataFrames) to Vault files.



```python
import json
import pandas as pd

# 1. Export Dictionary to JSON
config = {
    "model": "RandomForest",
    "params": {"n_estimators": 100, "depth": 5},
    "version": 1.2
}
json_path = "DS_Studio/outputs/model_config.json"
await obsidian.export_json(config, json_path)
print(f"✅ JSON config exported to {json_path}")

# 2. Export Pandas DataFrame to CSV
df_metrics = pd.DataFrame({
    'Metric': ['Accuracy', 'Recall', 'F1'],
    'Value': [0.95, 0.92, 0.93]
})
csv_path = "DS_Studio/outputs/metrics.csv"
await obsidian.export_csv(df_metrics, csv_path)
print(f"✅ Pandas DataFrame exported to {csv_path}")
```

## 6.4 Frontmatter (Metadata) Operations

Manipulating YAML frontmatter is essential for Obsidian workflows.

Python

```python

path = "DS_Studio/Projects/metadata_test.md"

print(f"📄 Target: {path}")

# 1. Read current metadata
meta = await obsidian.get_frontmatter(path)
print(f"📋 Current Status: {meta.get('status')}")

# 2. Update metadata
print("🔄 Updating metadata...")
await obsidian.update_frontmatter(path, {
    "status": "completed",
    "reviewed_by": "Python Script",
    "accuracy_score": 0.985,
    "last_analysis": "2024-05-20"
})

# 3. Verify
new_meta = await obsidian.get_frontmatter(path)
print(f"✅ New Status: {new_meta.get('status')}")
print("👀 Check the file header to see changes!")
```

## 6.5 File Deletion Workflow

Creating a temporary file and deleting it to demonstrate cleanup.

Python

```python

temp_file = "DS_Studio/outputs/temp_delete_me.txt"

# 1. CreateZ
await obsidian.write_file(temp_file, "Delete me please.")
print("1️⃣ Created temp file.")

# 2. Verify
if await obsidian.file_exists(temp_file):
    print("2️⃣ File verification: Exists.")
    
    # 3. Delete
    await obsidian.delete_file(temp_file)
    print("3️⃣ File deleted.")

    # 4. Verify again
    if not await obsidian.file_exists(temp_file):
        print("4️⃣ Confirmation: File is gone.")
```



---

# 7. 🚀 Complete Data Pipeline

This final example combines everything: Installing python package, Reading a CSV from the Vault, analyzing it with Pandas, generating a Markdown report with a summary table, and saving it back to the Vault.

Python

```python

import micropip
import pandas as pd
from datetime import datetime
import obsidian


# Run the installation
await micropip.install("tabulate")

# 1. Load Data from Vault
csv_path = "DS_Studio/datasets/sales_data.csv"
print(f"📥 Loading Data from {csv_path}...")

# read_csv automatically converts to DataFrame if pandas is imported
df = await obsidian.read_csv(csv_path)
print(f"✅ Loaded {len(df)} rows.")

# 2. Analyze Data
print("📊 Analyzing data...")
summary = df.groupby('Region')['Sales'].sum().reset_index()
summary['Sales'] = summary['Sales'].map('${:,.2f}'.format) # Format currency
best_region = summary.sort_values('Sales', ascending=False).iloc[0]

# 3. Generate Markdown Report
report = f"""# Sales Analysis Report
**Generated:** {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## Executive Summary
The best performing region is **{best_region['Region']}** with total sales of **{best_region['Sales']}**.

## Regional Breakdown

{summary.to_markdown(index=False)}

---
*Generated by Python DS Studio*
"""

# 4. Save Report
report_path = "DS_Studio/outputs/Final_Sales_Report.md"
await obsidian.write_file(report_path, report)
print(f"📝 Report saved to: {report_path}")

# 5. Update Metadata of the report itself
await obsidian.update_frontmatter(report_path, {
    "type": "report",
    "top_region": best_region['Region'],
    "source_data": csv_path
})
print("✅ Pipeline Finished Successfully!")
```








