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
