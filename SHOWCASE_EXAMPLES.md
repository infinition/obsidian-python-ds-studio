<<<<<<< HEAD
# Python DS Studio - Examples

This document contains Python code blocks to demonstrate the features of **Python DS Studio**. These examples can be used to generate visualizations and data summaries for documentation.

---

## 1. Statistical Visualization (Seaborn)
This example creates a statistical plot using Seaborn's built-in datasets.

```python
import seaborn as sns
import matplotlib.pyplot as plt

# Set the aesthetic style of the plots
sns.set_theme(style="whitegrid")

# Load the example diamonds dataset
diamonds = sns.load_dataset("diamonds")

# Draw a scatter plot while assigning point colors and sizes to different
# variables in the dataset
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

---

## 2. Data Exploration (Pandas)
Run this block to create a DataFrame for inspection in the **Variable Explorer**.

```python
import pandas as pd
import numpy as np

# Create a synthetic sales dataset
data = {
    'Date': pd.date_range(start='2023-01-01', periods=10, freq='D'),
    'Product': ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'] * 2,
    'Sales': np.random.randint(100, 1000, size=10),
    'Growth': np.random.uniform(0.01, 0.15, size=10).round(4),
    'Status': ['Shipped', 'Pending', 'Delivered', 'Cancelled', 'Shipped'] * 2
}

df = pd.DataFrame(data)

# Display the summary in the console
print("--- Sales Data Summary ---")
print(df.describe())
print("\n--- Full DataFrame ---")
print(df)
```

---

## 3. Mathematical Functions (Matplotlib)
A mathematical plot using NumPy and Matplotlib with custom styling.

```python
import numpy as np
import matplotlib.pyplot as plt

# Generate data
x = np.linspace(0, 2 * np.pi, 400)
y1 = np.sin(x**2)
y2 = np.cos(x)

# Create plot
plt.figure(figsize=(10, 5), facecolor='#1e1e1e')
ax = plt.axes()
ax.set_facecolor('#1e1e1e')

plt.plot(x, y1, color='#00ff00', label='sin(x^2)', linewidth=2)
plt.plot(x, y2, color='#ff00ff', label='cos(x)', linestyle='--', linewidth=2)

# Styling
plt.title("Waveform Analysis", color='white', fontsize=14)
plt.legend()
plt.grid(color='#444444', linestyle=':')
ax.tick_params(colors='white')

plt.show()
```

---

## 4. Distribution Analysis (Seaborn)
An example of handling multiple subplots and distributions.

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

## 5. Clustering (Scikit-Learn)
*Note: Requires installing `scikit-learn` via the Packages tab.*

```python
from sklearn.datasets import make_blobs
from sklearn.cluster import KMeans
import matplotlib.pyplot as plt

# Generate synthetic clusters
X, y = make_blobs(n_samples=300, centers=4, cluster_std=0.60, random_state=0)

# Apply KMeans
kmeans = KMeans(n_clusters=4)
kmeans.fit(X)
y_kmeans = kmeans.predict(X)

# Plot results
plt.scatter(X[:, 0], X[:, 1], c=y_kmeans, s=50, cmap='viridis')

centers = kmeans.cluster_centers_
plt.scatter(
    centers[:, 0],
    centers[:, 1],
    s=200,
    c='red',
    alpha=0.5,
    label='Centroids'
)

plt.title("K-Means Clustering")
plt.legend()
plt.show()

```

---

## 6. Package Installation (Async)
Demonstrates installing packages at runtime using `micropip`.

```python
import micropip
import asyncio

async def setup_environment():
    print("--- Initializing Environment ---")
    packages = ["scipy", "networkx", "statsmodels"]
    for pkg in packages:
        print(f"Installing {pkg}...")
        await micropip.install(pkg)
    print("--- Environment Ready ---")

# Run the setup
await setup_environment()

import networkx as nx
import matplotlib.pyplot as plt

# Create a graph to verify installation
G = nx.erdos_renyi_graph(20, 0.2)
plt.figure(figsize=(8, 5))
nx.draw(G, with_labels=True, node_color='skyblue', edge_color='#444444')
plt.title("Network Analysis (NetworkX)")
plt.show()
```

---

## 7. Machine Learning: Decision Boundaries
Visualization of how a classifier divides space using Scikit-Learn.

```python
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import make_moons
from sklearn.ensemble import RandomForestClassifier

# Generate data
X, y = make_moons(n_samples=100, noise=0.25, random_state=3)

# Train a Random Forest
forest = RandomForestClassifier(n_estimators=5, random_state=2)
forest.fit(X, y)

# Create a mesh grid for visualization
x_min, x_max = X[:, 0].min() - 0.5, X[:, 0].max() + 0.5
y_min, y_max = X[:, 1].min() - 0.5, X[:, 1].max() + 0.5
xx, yy = np.meshgrid(np.arange(x_min, x_max, 0.02),
                     np.arange(y_min, y_max, 0.02))

Z = forest.predict(np.c_[xx.ravel(), yy.ravel()])
Z = Z.reshape(xx.shape)

# Plot decision boundaries
plt.figure(figsize=(10, 6))
plt.contourf(xx, yy, Z, alpha=0.3, cmap='RdYlBu')
plt.scatter(X[:, 0], X[:, 1], c=y, s=40, edgecolor='k', cmap='RdYlBu')
plt.title("Random Forest Decision Boundaries")
plt.show()
```

---

## 8. Time Series Analysis
Financial data simulation using Pandas and Matplotlib.

```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# Simulate stock price data
np.random.seed(42)
dates = pd.date_range('2023-01-01', periods=200)
prices = 100 + np.cumsum(np.random.randn(200))
df = pd.DataFrame({'Price': prices}, index=dates)

# Calculate moving averages
df['MA20'] = df['Price'].rolling(window=20).mean()
df['MA50'] = df['Price'].rolling(window=50).mean()

# Plot
plt.figure(figsize=(12, 6), facecolor='#0d1117')
ax = plt.axes()
ax.set_facecolor('#0d1117')

plt.plot(df.index, df['Price'], label='Spot Price', color='#58a6ff', alpha=0.8)
plt.plot(df.index, df['MA20'], label='20-Day MA', color='#3fb950', linewidth=2)
plt.plot(df.index, df['MA50'], label='50-Day MA', color='#f85149', linewidth=2)

plt.title("Financial Analysis: Moving Averages", color='white', fontsize=16)
plt.legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='white')
ax.tick_params(colors='white')
plt.grid(color='#30363d', linestyle='--')

plt.show()
```


## 9. Interactive 3D Visualization (Plotly)

Visualisation 3D interactive avec rotation, zoom et hover.

```python
import plotly.graph_objects as go
import numpy as np

# Generate 3D surface data
x = np.linspace(-5, 5, 50)
y = np.linspace(-5, 5, 50)
X, Y = np.meshgrid(x, y)
Z = np.sin(np.sqrt(X**2 + Y**2))

# Create interactive surface plot
fig = go.Figure(
    data=[
        go.Surface(
            x=X,
            y=Y,
            z=Z,
            colorscale='Viridis'
        )
    ]
)

fig.update_layout(
    title="3D Surface Plot (Interactive)",
    scene=dict(
        xaxis_title="X",
        yaxis_title="Y",
        zaxis_title="Z"
    ),
    width=800,
    height=600
)

fig.show()
```

**Démontré :**

* Rotation 3D temps réel
* Zoom / pan
* Tooltips dynamiques
  ➡️ Excellent pour maths, physique, optimisation, ML surfaces.

---

## 10. Interactive 3D Scatter (Plotly + Clusters)

Nuage de points 3D avec coloration par cluster.

```python
import numpy as np
import plotly.express as px
from sklearn.datasets import make_blobs

# Generate 3D clustered data
X, y = make_blobs(
    n_samples=500,
    centers=4,
    n_features=3,
    random_state=42
)

# Create interactive 3D scatter
fig = px.scatter_3d(
    x=X[:, 0],
    y=X[:, 1],
    z=X[:, 2],
    color=y,
    title="3D Cluster Visualization",
    opacity=0.8
)

fig.update_traces(marker=dict(size=4))
fig.show()
```

**Idéal pour :**

* Clustering
* PCA / réduction de dimension
* Visualisation exploratoire avancée

---

## 11. Interactive Dashboard (Bokeh)

Graphique + widgets interactifs (slider).

```python
from bokeh.plotting import figure, show
from bokeh.models import Slider
from bokeh.layouts import column
import numpy as np

# Initial data
x = np.linspace(0, 10, 200)
freq = 1
y = np.sin(freq * x)

p = figure(
    title="Interactive Sine Wave",
    width=700,
    height=400
)
line = p.line(x, y, line_width=3, color="cyan")

# Slider widget
slider = Slider(
    start=1,
    end=10,
    value=1,
    step=0.5,
    title="Frequency"
)

def update(attr, old, new):
    freq = slider.value
    line.data_source.data['y'] = np.sin(freq * x)

slider.on_change('value', update)

show(column(p, slider))
```

**Démontré :**

* Widgets natifs
* Callbacks Python
* Mise à jour en temps réel

➡️ Très “notebook-like”, parfait pour **exploration interactive**.

---

## 12. Streaming-like Data Visualization (Bokeh)

Simulation de données temps réel.

```python
from bokeh.plotting import figure, show
from bokeh.models import ColumnDataSource
from bokeh.io import curdoc
import numpy as np
import time

source = ColumnDataSource(data=dict(x=[], y=[]))

p = figure(
    title="Streaming Data Simulation",
    width=700,
    height=400
)
p.line('x', 'y', source=source, line_width=2)

def update():
    new_x = list(source.data['x'])
    new_y = list(source.data['y'])

    t = time.time()
    new_x.append(t)
    new_y.append(np.sin(t))

    source.data = dict(x=new_x[-100:], y=new_y[-100:])

curdoc().add_periodic_callback(update, 200)
show(p)
```

**Cas d’usage :**

* Monitoring
* Capteurs
* Séries temporelles live
* Simulations

---


## 14. Animated 3D Scatter (Plotly)

Animated 3D visualization showing cluster evolution over time.

```python
import numpy as np
import plotly.express as px

# Generate time-based 3D data
frames = []
np.random.seed(42)

for t in range(20):
    x = np.random.randn(200) + np.sin(t / 3)
    y = np.random.randn(200) + np.cos(t / 3)
    z = np.random.randn(200)
    frames.append(
        px.scatter_3d(
            x=x, y=y, z=z,
            opacity=0.7
        ).data[0]
    )

fig = px.scatter_3d(
    x=frames[0].x,
    y=frames[0].y,
    z=frames[0].z,
    title="Animated 3D Scatter (Time Evolution)"
)

fig.frames = [dict(data=[f]) for f in frames]
fig.show()
```

**Highlights**

* Frame-based animation
* 3D rotation + zoom
* Excellent for simulations and temporal data

---

## 15. Interactive Heatmap (Plotly)

Hoverable heatmap with dynamic color scaling.

```python
import numpy as np
import plotly.express as px

# Generate matrix data
z = np.random.rand(20, 20)

fig = px.imshow(
    z,
    color_continuous_scale="Inferno",
    title="Interactive Heatmap"
)

fig.update_layout(
    xaxis_title="Feature X",
    yaxis_title="Feature Y"
)

fig.show()
```

**Use cases**

* Correlation matrices
* Confusion matrices
* Feature importance grids

---

## 16. PCA Visualization in 3D (Plotly + Scikit-Learn)

Interactive dimensionality reduction visualization.

```python
from sklearn.datasets import load_iris
from sklearn.decomposition import PCA
import plotly.express as px

# Load dataset
X, y = load_iris(return_X_y=True)

# Reduce to 3 dimensions
pca = PCA(n_components=3)
X_pca = pca.fit_transform(X)

fig = px.scatter_3d(
    x=X_pca[:, 0],
    y=X_pca[:, 1],
    z=X_pca[:, 2],
    color=y,
    title="PCA Projection (3D)"
)

fig.show()
```

**Demonstrates**

* PCA / dimensionality reduction
* Interactive cluster inspection
* ML model explainability

---

## 17. Linked Interactive Plots (Bokeh)

Two plots linked via shared data source.

```python
from bokeh.plotting import figure, show
from bokeh.layouts import row
from bokeh.models import ColumnDataSource
import numpy as np

x = np.linspace(0, 10, 200)
y = np.sin(x)
z = np.cos(x)

source = ColumnDataSource(data=dict(x=x, y=y, z=z))

p1 = figure(title="Sine Wave", width=400, height=300)
p1.line('x', 'y', source=source, line_width=2)

p2 = figure(title="Cosine Wave", width=400, height=300)
p2.line('x', 'z', source=source, line_width=2, color="orange")

show(row(p1, p2))
```

**Key concept**

* Shared state between visualizations
* Coordinated data exploration

---

## 18. Interactive Histogram with Slider (Bokeh)

Dynamic bin control using widgets.

```python
from bokeh.plotting import figure, show
from bokeh.models import Slider, ColumnDataSource
from bokeh.layouts import column
import numpy as np

data = np.random.randn(1000)
hist, edges = np.histogram(data, bins=20)

source = ColumnDataSource(data=dict(top=hist, left=edges[:-1], right=edges[1:]))

p = figure(title="Interactive Histogram", width=700, height=400)
p.quad(
    top='top',
    bottom=0,
    left='left',
    right='right',
    source=source,
    fill_color="cyan",
    line_color="white"
)

slider = Slider(start=5, end=50, value=20, step=1, title="Number of bins")

def update(attr, old, new):
    hist, edges = np.histogram(data, bins=slider.value)
    source.data = dict(top=hist, left=edges[:-1], right=edges[1:])

slider.on_change('value', update)

show(column(p, slider))
```

**Perfect for**

* Distribution analysis
* Teaching statistics
* Interactive data exploration

---

## 19. Interactive Decision Surface (Plotly)

Model prediction surface with hover inspection.

```python
import numpy as np
import plotly.graph_objects as go
from sklearn.svm import SVC
from sklearn.datasets import make_moons

# Generate data
X, y = make_moons(n_samples=200, noise=0.2, random_state=0)

# Train model
model = SVC(kernel='rbf', gamma='auto')
model.fit(X, y)

# Create grid
xx, yy = np.meshgrid(
    np.linspace(X[:,0].min()-1, X[:,0].max()+1, 100),
    np.linspace(X[:,1].min()-1, X[:,1].max()+1, 100)
)

Z = model.predict(np.c_[xx.ravel(), yy.ravel()])
Z = Z.reshape(xx.shape)

fig = go.Figure()

fig.add_contour(
    x=xx[0],
    y=yy[:,0],
    z=Z,
    colorscale='RdBu',
    opacity=0.4
)

fig.add_scatter(
    x=X[:,0],
    y=X[:,1],
    mode='markers',
    marker=dict(color=y, size=6)
)

fig.update_layout(title="Interactive SVM Decision Surface")
fig.show()
```

=======
# Python DS Studio - Examples

This document contains Python code blocks to demonstrate the features of **Python DS Studio**. These examples can be used to generate visualizations and data summaries for documentation.

---

## 1. Statistical Visualization (Seaborn)
This example creates a statistical plot using Seaborn's built-in datasets.

```python
import seaborn as sns
import matplotlib.pyplot as plt

# Set the aesthetic style of the plots
sns.set_theme(style="whitegrid")

# Load the example diamonds dataset
diamonds = sns.load_dataset("diamonds")

# Draw a scatter plot while assigning point colors and sizes to different
# variables in the dataset
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

---

## 2. Data Exploration (Pandas)
Run this block to create a DataFrame for inspection in the **Variable Explorer**.

```python
import pandas as pd
import numpy as np

# Create a synthetic sales dataset
data = {
    'Date': pd.date_range(start='2023-01-01', periods=10, freq='D'),
    'Product': ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'] * 2,
    'Sales': np.random.randint(100, 1000, size=10),
    'Growth': np.random.uniform(0.01, 0.15, size=10).round(4),
    'Status': ['Shipped', 'Pending', 'Delivered', 'Cancelled', 'Shipped'] * 2
}

df = pd.DataFrame(data)

# Display the summary in the console
print("--- Sales Data Summary ---")
print(df.describe())
print("\n--- Full DataFrame ---")
print(df)
```

---

## 3. Mathematical Functions (Matplotlib)
A mathematical plot using NumPy and Matplotlib with custom styling.

```python
import numpy as np
import matplotlib.pyplot as plt

# Generate data
x = np.linspace(0, 2 * np.pi, 400)
y1 = np.sin(x**2)
y2 = np.cos(x)

# Create plot
plt.figure(figsize=(10, 5), facecolor='#1e1e1e')
ax = plt.axes()
ax.set_facecolor('#1e1e1e')

plt.plot(x, y1, color='#00ff00', label='sin(x^2)', linewidth=2)
plt.plot(x, y2, color='#ff00ff', label='cos(x)', linestyle='--', linewidth=2)

# Styling
plt.title("Waveform Analysis", color='white', fontsize=14)
plt.legend()
plt.grid(color='#444444', linestyle=':')
ax.tick_params(colors='white')

plt.show()
```

---

## 4. Distribution Analysis (Seaborn)
An example of handling multiple subplots and distributions.

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

## 5. Clustering (Scikit-Learn)
*Note: Requires installing `scikit-learn` via the Packages tab.*

```python
from sklearn.datasets import make_blobs
from sklearn.cluster import KMeans
import matplotlib.pyplot as plt

# Generate synthetic clusters
X, y = make_blobs(n_samples=300, centers=4, cluster_std=0.60, random_state=0)

# Apply KMeans
kmeans = KMeans(n_clusters=4)
kmeans.fit(X)
y_kmeans = kmeans.predict(X)

# Plot results
plt.scatter(X[:, 0], X[:, 1], c=y_kmeans, s=50, cmap='viridis')
centers = kmeans.cluster_centers()
plt.scatter(centers[:, 0], centers[:, 1], c='red', s=200, alpha=0.5, label='Centroids')

plt.title("K-Means Clustering")
plt.legend()
plt.show()
```

---

## 6. Package Installation (Async)
Demonstrates installing packages at runtime using `micropip`.

```python
import micropip
import asyncio

async def setup_environment():
    print("--- Initializing Environment ---")
    packages = ["scipy", "networkx", "statsmodels"]
    for pkg in packages:
        print(f"Installing {pkg}...")
        await micropip.install(pkg)
    print("--- Environment Ready ---")

# Run the setup
await setup_environment()

import networkx as nx
import matplotlib.pyplot as plt

# Create a graph to verify installation
G = nx.erdos_renyi_graph(20, 0.2)
plt.figure(figsize=(8, 5))
nx.draw(G, with_labels=True, node_color='skyblue', edge_color='#444444')
plt.title("Network Analysis (NetworkX)")
plt.show()
```

---

## 7. Machine Learning: Decision Boundaries
Visualization of how a classifier divides space using Scikit-Learn.

```python
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import make_moons
from sklearn.ensemble import RandomForestClassifier

# Generate data
X, y = make_moons(n_samples=100, noise=0.25, random_state=3)

# Train a Random Forest
forest = RandomForestClassifier(n_estimators=5, random_state=2)
forest.fit(X, y)

# Create a mesh grid for visualization
x_min, x_max = X[:, 0].min() - 0.5, X[:, 0].max() + 0.5
y_min, y_max = X[:, 1].min() - 0.5, X[:, 1].max() + 0.5
xx, yy = np.meshgrid(np.arange(x_min, x_max, 0.02),
                     np.arange(y_min, y_max, 0.02))

Z = forest.predict(np.c_[xx.ravel(), yy.ravel()])
Z = Z.reshape(xx.shape)

# Plot decision boundaries
plt.figure(figsize=(10, 6))
plt.contourf(xx, yy, Z, alpha=0.3, cmap='RdYlBu')
plt.scatter(X[:, 0], X[:, 1], c=y, s=40, edgecolor='k', cmap='RdYlBu')
plt.title("Random Forest Decision Boundaries")
plt.show()
```

---

## 8. Time Series Analysis
Financial data simulation using Pandas and Matplotlib.

```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

# Simulate stock price data
np.random.seed(42)
dates = pd.date_range('2023-01-01', periods=200)
prices = 100 + np.cumsum(np.random.randn(200))
df = pd.DataFrame({'Price': prices}, index=dates)

# Calculate moving averages
df['MA20'] = df['Price'].rolling(window=20).mean()
df['MA50'] = df['Price'].rolling(window=50).mean()

# Plot
plt.figure(figsize=(12, 6), facecolor='#0d1117')
ax = plt.axes()
ax.set_facecolor('#0d1117')

plt.plot(df.index, df['Price'], label='Spot Price', color='#58a6ff', alpha=0.8)
plt.plot(df.index, df['MA20'], label='20-Day MA', color='#3fb950', linewidth=2)
plt.plot(df.index, df['MA50'], label='50-Day MA', color='#f85149', linewidth=2)

plt.title("Financial Analysis: Moving Averages", color='white', fontsize=16)
plt.legend(facecolor='#161b22', edgecolor='#30363d', labelcolor='white')
ax.tick_params(colors='white')
plt.grid(color='#30363d', linestyle='--')

plt.show()
```
>>>>>>> 12fda4c8ecb1bf971dad73d6e47fdd6588e3cb9b
