/**
 * DataFrame Viewer Modal for Obsidian Python Data Studio
 * 
 * Provides an advanced modal for viewing and manipulating pandas DataFrames
 * with sorting, filtering, pagination, data science tools, and export features.
 */

import { App, Modal, Notice, setIcon } from 'obsidian';
import { t } from './i18n';

export interface DataFrameData {
    columns: string[];
    data: any[][];
    dtypes: Record<string, string>;
    shape: [number, number];
    memory_usage?: number;
    null_counts?: Record<string, number>;
}

export interface DataFrameViewerOptions {
    variableName: string;
    language: string;
    executePython: (code: string, wrap?: boolean) => Promise<{ text: string, image: string | null, error?: string }>;
    onClose?: () => void;
    getDataFrameList?: () => Promise<string[]>;
}

/**
 * Modal for viewing and interacting with pandas DataFrames
 */
export class DataFrameViewerModal extends Modal {
    private data: DataFrameData;
    private options: DataFrameViewerOptions;
    private currentPage: number = 1;
    private pageSize: number = 25;
    private sortColumn: string | null = null;
    private sortAscending: boolean = true;
    private filterText: string = '';
    private columnFilters: Map<string, Set<any>> = new Map();
    private activeColumnFilter: string | null = null;
    private isFullscreen: boolean = false;
    private isTransposed: boolean = false;
    private showAllRows: boolean = false;
    private consoleOutput: HTMLElement | null = null;
    private tableContainer: HTMLElement | null = null;
    private isResizing: boolean = false;
    private startX: number = 0;
    private startY: number = 0;
    private startWidth: number = 0;
    private startHeight: number = 0;
    private highlightedCells: Set<string> = new Set();
    private selectedColumns: Set<string> = new Set();
    private selectedRows: Set<number> = new Set();
    private isEditMode: boolean = false;
    private pendingChanges: Map<string, any> = new Map(); // key: "row,col" -> value
    private heatmapEnabled: boolean = false; // Smart coloring for numeric values
    private clipboard: { type: 'cell' | 'row' | 'column', data: any, rowIndex?: number, colName?: string } | null = null;
    private isEditingCell: boolean = false; // Prevent re-render during cell edit
    
    // Per-output heatmap settings stored by output index
    private outputHeatmapSettings: Map<number, { 
        transposed: boolean, 
        excludeHeader: boolean,
        excludedRows: Set<number>,
        excludedCols: Set<number>,
        excludedCells: Set<string> // "lineIdx,colIdx"
    }> = new Map();
    private outputCounter: number = 0;
    
    // Autocomplete for console input
    private autocompleteContainer: HTMLElement | null = null;
    private autocompleteIndex: number = -1;
    private commandHistory: string[] = [];
    private historyIndex: number = -1;
    
    // Python/Pandas method suggestions
    private static readonly PANDAS_METHODS = [
        // Basic info
        'head()', 'tail()', 'info()', 'describe()', 'shape', 'columns', 'dtypes', 'index',
        // Selection
        'loc[]', 'iloc[]', 'at[]', 'iat[]', 'query()', 'filter()',
        // Data manipulation
        'drop()', 'dropna()', 'fillna()', 'replace()', 'rename()', 'reset_index()', 'set_index()',
        'sort_values()', 'sort_index()', 'groupby()', 'pivot_table()', 'melt()', 'merge()', 'concat()',
        // Statistics
        'mean()', 'median()', 'std()', 'var()', 'min()', 'max()', 'sum()', 'count()', 'nunique()',
        'value_counts()', 'corr()', 'cov()', 'quantile()', 'mode()', 'skew()', 'kurt()',
        // Apply/Transform
        'apply()', 'applymap()', 'transform()', 'agg()', 'pipe()',
        // Missing data
        'isna()', 'isnull()', 'notna()', 'notnull()',
        // Duplicates
        'duplicated()', 'drop_duplicates()',
        // Type conversion
        'astype()', 'to_numeric()', 'to_datetime()', 'to_string()',
        // Export
        'to_csv()', 'to_json()', 'to_excel()', 'to_dict()', 'to_numpy()', 'to_markdown()',
        // Plotting
        'plot()', 'hist()', 'boxplot()', 'plot.scatter()', 'plot.bar()', 'plot.line()',
        // String methods
        'str.lower()', 'str.upper()', 'str.strip()', 'str.contains()', 'str.replace()', 'str.split()',
        // Datetime methods
        'dt.year', 'dt.month', 'dt.day', 'dt.hour', 'dt.minute', 'dt.date', 'dt.time', 'dt.dayofweek',
    ];
    
    // Smart context - learned from outputs
    private discoveredColumns: Map<string, { source: string, type?: string, count: number }> = new Map();
    private discoveredVariables: Set<string> = new Set();
    private recentOperations: string[] = [];
    
    // Common Python/Pandas patterns for smart suggestions
    private static readonly SMART_PATTERNS: Record<string, string[]> = {
        // After specific methods
        'groupby': ['sum()', 'mean()', 'count()', 'agg()', 'first()', 'last()', 'size()'],
        'sort_values': ['ascending=True', 'ascending=False', 'by=', 'inplace=True'],
        'fillna': ['method="ffill"', 'method="bfill"', 'value=0', 'inplace=True'],
        'dropna': ['how="any"', 'how="all"', 'subset=', 'inplace=True'],
        'merge': ['on=', 'how="inner"', 'how="left"', 'how="right"', 'how="outer"'],
        'pivot_table': ['values=', 'index=', 'columns=', 'aggfunc='],
        'apply': ['axis=0', 'axis=1', 'lambda x:', 'result_type='],
        'astype': ['"int"', '"float"', '"str"', '"category"', '"datetime64"'],
        'query': ['>', '<', '==', '!=', '&', '|', 'in', 'not in'],
        'loc': [':', ','],
        'iloc': [':', ','],
        'plot': ['kind="bar"', 'kind="line"', 'kind="scatter"', 'kind="hist"', 'kind="box"', 'figsize='],
    };
    
    constructor(app: App, data: DataFrameData, options: DataFrameViewerOptions) {
        super(app);
        this.data = data;
        this.options = options;
    }
    
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('df-viewer-modal');
        
        // Set initial size
        const modalEl = this.containerEl.querySelector('.modal') as HTMLElement;
        if (modalEl) {
            modalEl.style.width = '1200px';
            modalEl.style.height = '80vh';
            modalEl.style.maxWidth = '95vw';
            modalEl.style.maxHeight = '90vh';
        }
        
    this.renderModal(false);
        this.setupResizeHandles();
        this.setupKeyboardShortcuts();
    }
    
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.removeClass('df-viewer-modal');
        contentEl.removeClass('df-fullscreen');
        this.options.onClose?.();
        // Remove keyboard listener
        document.removeEventListener('keydown', this.keyboardHandler);
    }
    
    private keyboardHandler = (e: KeyboardEvent) => {
        // Don't handle if editing a cell
        if (this.isEditingCell) return;
        
        const isCtrl = e.ctrlKey || e.metaKey;
        
        if (isCtrl && e.key === 'c') {
            this.handleCopy();
        } else if (isCtrl && e.key === 'x') {
            this.handleCut();
        } else if (isCtrl && e.key === 'v') {
            this.handlePaste();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.selectedRows.size > 0 || this.selectedColumns.size > 0) {
                e.preventDefault();
                this.handleDelete();
            }
        } else if (e.key === 'Escape') {
            this.selectedRows.clear();
            this.selectedColumns.clear();
            this.renderTable();
        } else if (isCtrl && e.key === 'a') {
            // Select all rows
            e.preventDefault();
            for (let i = 0; i < this.data.data.length; i++) {
                this.selectedRows.add(i);
            }
            this.renderTable();
        }
    };
    
    private setupKeyboardShortcuts() {
        document.addEventListener('keydown', this.keyboardHandler);
    }
    
    private handleCopy() {
        if (this.selectedRows.size > 0) {
            const rows = Array.from(this.selectedRows).sort((a, b) => a - b);
            const text = rows.map(r => this.data.data[r].join('\t')).join('\n');
            navigator.clipboard.writeText(text);
            this.appendToConsole(`Copied ${rows.length} row(s)`);
        } else if (this.selectedColumns.size > 0) {
            const cols = Array.from(this.selectedColumns);
            const colIndices = cols.map(c => this.data.columns.indexOf(c));
            const text = this.data.data.map(row => colIndices.map(i => row[i]).join('\t')).join('\n');
            navigator.clipboard.writeText(text);
            this.appendToConsole(`Copied ${cols.length} column(s)`);
        }
    }
    
    private handleCut() {
        this.handleCopy();
        // Mark for deletion
        if (this.selectedRows.size > 0) {
            this.appendToConsole(`Cut ${this.selectedRows.size} row(s) - press Delete to remove`);
        } else if (this.selectedColumns.size > 0) {
            this.appendToConsole(`Cut ${this.selectedColumns.size} column(s) - press Delete to remove`);
        }
    }
    
    private async handlePaste() {
        try {
            const text = await navigator.clipboard.readText();
            const lines = text.split('\n').filter(l => l.trim());
            
            if (this.selectedRows.size === 1) {
                // Paste into selected row
                const rowIndex = Array.from(this.selectedRows)[0];
                const values = lines[0].split('\t');
                values.forEach((val, colIdx) => {
                    if (colIdx < this.data.columns.length) {
                        this.pendingChanges.set(`${rowIndex},${this.data.columns[colIdx]}`, val);
                    }
                });
                this.renderTable();
                this.appendToConsole(`Pasted into row ${rowIndex}`);
            } else {
                this.appendToConsole(`Select a single row to paste data`);
            }
        } catch (err) {
            this.appendToConsole(`Paste failed: ${err}`);
        }
    }
    
    private async handleDelete() {
        if (this.selectedRows.size > 0) {
            const rows = Array.from(this.selectedRows).sort((a, b) => b - a); // Delete from end
            for (const rowIndex of rows) {
                await this.deleteRow(rowIndex);
            }
            this.selectedRows.clear();
        } else if (this.selectedColumns.size > 0) {
            const cols = Array.from(this.selectedColumns);
            for (const colName of cols) {
                await this.deleteColumn(colName);
            }
            this.selectedColumns.clear();
        }
    }
    
    private setupResizeHandles() {
        const modalEl = this.containerEl.querySelector('.modal') as HTMLElement;
        if (!modalEl) return;
        
        // Create resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'df-resize-handle';
        modalEl.appendChild(resizeHandle);
        
        // Create edge resize zones
        const resizeRight = document.createElement('div');
        resizeRight.className = 'df-resize-edge df-resize-right';
        modalEl.appendChild(resizeRight);
        
        const resizeBottom = document.createElement('div');
        resizeBottom.className = 'df-resize-edge df-resize-bottom';
        modalEl.appendChild(resizeBottom);
        
        // Corner resize (SE)
        resizeHandle.addEventListener('mousedown', (e) => this.startResize(e, 'se', modalEl));
        resizeRight.addEventListener('mousedown', (e) => this.startResize(e, 'e', modalEl));
        resizeBottom.addEventListener('mousedown', (e) => this.startResize(e, 's', modalEl));
    }
    
    private startResize(e: MouseEvent, direction: string, modalEl: HTMLElement) {
        e.preventDefault();
        this.isResizing = true;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.startWidth = modalEl.offsetWidth;
        this.startHeight = modalEl.offsetHeight;
        
        const onMouseMove = (e: MouseEvent) => {
            if (!this.isResizing) return;
            
            const deltaX = e.clientX - this.startX;
            const deltaY = e.clientY - this.startY;
            
            if (direction.includes('e')) {
                const newWidth = Math.max(400, this.startWidth + deltaX);
                modalEl.style.width = newWidth + 'px';
            }
            if (direction.includes('s')) {
                const newHeight = Math.max(300, this.startHeight + deltaY);
                modalEl.style.height = newHeight + 'px';
            }
        };
        
        const onMouseUp = () => {
            this.isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
    
    private renderModal(clearConsole: boolean = true) {
        const { contentEl } = this;
        // Sauvegarder la console si demandé
        let oldConsole: HTMLElement | null = null;
        if (!clearConsole && this.consoleOutput && this.consoleOutput.parentElement) {
            oldConsole = this.consoleOutput;
        }
        contentEl.empty();
        // Header
        const header = contentEl.createEl('div', { cls: 'df-header' });
        // ...existing code...
        // Restaurer la console si besoin, mais uniquement si pas fullscreen OU si la console est en bas
        if (oldConsole) {
            // On ne réinjecte la console en haut que si on n'est PAS en fullscreen
            if (!this.isFullscreen) {
                contentEl.appendChild(oldConsole);
            }
            // Sinon, la console reste en bas (footer ou section dédiée)
        }
        
        const titleRow = header.createEl('div', { cls: 'df-title-row' });
        const titleEl = titleRow.createEl('h2', { cls: 'df-title' });
        titleEl.createSpan({ text: `📊 ${this.options.variableName}` });
        if (this.isTransposed) {
            titleEl.createSpan({ text: ' (T)', cls: 'df-transposed-badge' });
        }
        
        const headerActions = titleRow.createEl('div', { cls: 'df-header-actions' });
        
        // Fullscreen button
        const btnFullscreen = headerActions.createEl('button', { cls: 'df-btn-icon' });
        setIcon(btnFullscreen, this.isFullscreen ? 'minimize-2' : 'maximize-2');
        btnFullscreen.setAttribute('title', 'Fullscreen');
        btnFullscreen.onclick = () => this.toggleFullscreen();
        
        // Close button
        const btnClose = headerActions.createEl('button', { cls: 'df-btn-icon df-btn-close' });
        setIcon(btnClose, 'x');
        btnClose.onclick = () => this.close();
        
        // Stats row
        const statsRow = header.createEl('div', { cls: 'df-stats-row' });
        const displayShape = this.isTransposed 
            ? `${this.data.shape[1]} × ${this.data.shape[0]}`
            : `${this.data.shape[0]} × ${this.data.shape[1]}`;
        statsRow.createEl('span', { 
            text: `Shape: ${displayShape}`,
            cls: 'df-stat'
        });
        
        const totalNulls = this.data.null_counts 
            ? Object.values(this.data.null_counts).reduce((a, b) => a + b, 0) 
            : 0;
        statsRow.createEl('span', { 
            text: `Nulls: ${totalNulls}`,
            cls: 'df-stat df-stat-nulls'
        });
        
        if (this.data.memory_usage) {
            statsRow.createEl('span', { 
                text: `Memory: ${this.formatBytes(this.data.memory_usage)}`,
                cls: 'df-stat'
            });
        }
        
        // Active filters indicator
        if (this.columnFilters.size > 0) {
            const filterIndicator = statsRow.createEl('span', { 
                text: `🔽 ${this.columnFilters.size} filter(s)`,
                cls: 'df-stat df-stat-filter'
            });
            filterIndicator.onclick = () => {
                this.columnFilters.clear();
                this.currentPage = 1;
                this.renderTable();
                this.renderModal(false);
            };
            filterIndicator.setAttribute('title', 'Click to clear all filters');
        }
        
        // ========== TOOLBAR ROW 1 - Search & Display ==========
        const toolbar1 = contentEl.createEl('div', { cls: 'df-toolbar df-toolbar-main' });
        
        // Search filter
        const searchGroup = toolbar1.createEl('div', { cls: 'df-search-group' });
        const searchIcon = searchGroup.createEl('span', { cls: 'df-search-icon' });
        setIcon(searchIcon, 'search');
        const searchInput = searchGroup.createEl('input', { 
            type: 'text',
            placeholder: 'Filter all rows...',
            cls: 'df-search-input'
        });
        searchInput.value = this.filterText;
        searchInput.oninput = (e) => {
            this.filterText = (e.target as HTMLInputElement).value;
            this.currentPage = 1;
            this.renderTable();
        };
        
        // Clear search button
        if (this.filterText) {
            const btnClearSearch = searchGroup.createEl('button', { cls: 'df-btn-clear-search' });
            setIcon(btnClearSearch, 'x');
            btnClearSearch.onclick = () => {
                this.filterText = '';
                this.currentPage = 1;
                searchInput.value = '';
                this.renderTable();
            };
        }
        
        // Display options group
        const displayGroup = toolbar1.createEl('div', { cls: 'df-display-group' });
        
        // Page size selector
        displayGroup.createEl('span', { text: 'Show:', cls: 'df-label' });
        const pageSizeSelect = displayGroup.createEl('select', { cls: 'df-select' });
        [25, 50, 100, 200, 500, -1].forEach(size => {
            const option = pageSizeSelect.createEl('option', { 
                value: size.toString(),
                text: size === -1 ? 'All' : size.toString()
            });
            if (size === this.pageSize) option.selected = true;
        });
        pageSizeSelect.onchange = (e) => {
            this.pageSize = parseInt((e.target as HTMLSelectElement).value);
            this.showAllRows = this.pageSize === -1;
            this.currentPage = 1;
            this.renderTable();
        };
        
        // Show All Rows toggle
        const showAllLabel = displayGroup.createEl('label', { cls: 'df-checkbox-label' });
        const showAllCheck = showAllLabel.createEl('input', { type: 'checkbox', cls: 'df-checkbox' });
        showAllCheck.checked = this.showAllRows;
        showAllCheck.onchange = () => {
            this.showAllRows = showAllCheck.checked;
            this.pageSize = this.showAllRows ? -1 : 25;
            pageSizeSelect.value = this.pageSize.toString();
            this.currentPage = 1;
            this.renderTable();
        };
        showAllLabel.createSpan({ text: ' All Rows' });
        
        // View options
        const viewGroup = toolbar1.createEl('div', { cls: 'df-view-group' });
        
        // Transpose button
        const btnTranspose = viewGroup.createEl('button', { cls: 'df-btn-view' + (this.isTransposed ? ' active' : '') });
        setIcon(btnTranspose, 'rotate-cw');
        btnTranspose.createSpan({ text: ' Transpose' });
        btnTranspose.setAttribute('title', 'Transpose rows/columns');
        btnTranspose.onclick = () => this.toggleTranspose();
        
        // Reset view button
        const btnResetView = viewGroup.createEl('button', { cls: 'df-btn-view' });
        setIcon(btnResetView, 'refresh-cw');
        btnResetView.createSpan({ text: ' Reset' });
        btnResetView.setAttribute('title', 'Reset all filters and sorting');
        btnResetView.onclick = () => this.resetView();
        
        // ========== TOOLBAR ROW 2 - Data Science Tools ==========
        const toolbar2 = contentEl.createEl('div', { cls: 'df-toolbar df-toolbar-tools' });
        
        // Data cleaning group
        const cleanGroup = toolbar2.createEl('div', { cls: 'df-tool-section' });
        cleanGroup.createEl('span', { text: '🧹 Clean:', cls: 'df-section-label' });
        
        const btnDropNA = cleanGroup.createEl('button', { text: 'Drop NA', cls: 'df-btn-tool' });
        btnDropNA.setAttribute('title', 'Remove rows containing NaN values');
        btnDropNA.onclick = () => this.runDSTool('dropna');
        
        const btnFillNA = cleanGroup.createEl('button', { text: 'Fill NA ▾', cls: 'df-btn-tool' });
        btnFillNA.setAttribute('title', 'Fill NaN values with a specified method');
        btnFillNA.onclick = (e) => this.showFillNAOptions(e);
        
        const btnDropDupes = cleanGroup.createEl('button', { text: 'Drop Dupes', cls: 'df-btn-tool' });
        btnDropDupes.setAttribute('title', 'Remove duplicate rows');
        btnDropDupes.onclick = () => this.runDSTool('drop_duplicates');
        
        const btnResetIndex = cleanGroup.createEl('button', { text: 'Reset Index', cls: 'df-btn-tool' });
        btnResetIndex.setAttribute('title', 'Reset DataFrame index to default');
        btnResetIndex.onclick = () => this.runDSTool('reset_index');
        
        // Edit/Save group
        const editGroup = toolbar2.createEl('div', { cls: 'df-tool-section' });
        editGroup.createEl('span', { text: '✏️ Edit:', cls: 'df-section-label' });
        
        const btnEdit = editGroup.createEl('button', { cls: 'df-btn-tool df-btn-edit' });
        setIcon(btnEdit.createSpan({ cls: 'df-btn-icon-inline' }), 'edit');
        btnEdit.createSpan({ text: ' Edit Mode', cls: 'df-btn-text' });
        btnEdit.setAttribute('title', 'Toggle edit mode to modify cells, columns, and rows');
        btnEdit.onclick = () => this.toggleEditMode();
        
        const btnSave = editGroup.createEl('button', { cls: 'df-btn-tool df-btn-primary' });
        setIcon(btnSave.createSpan({ cls: 'df-btn-icon-inline' }), 'save');
        btnSave.createSpan({ text: ' Save', cls: 'df-btn-text' });
        btnSave.setAttribute('title', 'Save changes to the DataFrame variable');
        btnSave.onclick = () => this.saveChanges();
        
        // Save/Compare group
        const saveGroup = toolbar2.createEl('div', { cls: 'df-tool-section' });
        saveGroup.createEl('span', { text: '💾 Data:', cls: 'df-section-label' });
        
        const btnSaveAs = saveGroup.createEl('button', { cls: 'df-btn-tool df-btn-save' });
        setIcon(btnSaveAs.createSpan({ cls: 'df-btn-icon-inline' }), 'file-plus');
        btnSaveAs.createSpan({ text: ' Save As...', cls: 'df-btn-text' });
        btnSaveAs.setAttribute('title', 'Save DataFrame as a new variable');
        btnSaveAs.onclick = () => this.showSaveAsDialog();
        
        const btnCompare = saveGroup.createEl('button', { cls: 'df-btn-tool df-btn-compare' });
        setIcon(btnCompare.createSpan({ cls: 'df-btn-icon-inline' }), 'git-compare');
        btnCompare.createSpan({ text: ' Compare ▾', cls: 'df-btn-text' });
        btnCompare.setAttribute('title', 'Compare with another DataFrame');
        btnCompare.onclick = (e) => this.showCompareOptions(e);
        
        // ========== TOOLBAR ROW 3 - Export ==========
        const toolbar3 = contentEl.createEl('div', { cls: 'df-toolbar df-toolbar-export' });
        
        toolbar3.createEl('span', { text: '📤 Export:', cls: 'df-section-label' });
        
        const btnExportCSV = toolbar3.createEl('button', { cls: 'df-btn-export' });
        setIcon(btnExportCSV, 'file-text');
        btnExportCSV.createSpan({ text: ' CSV' });
        btnExportCSV.onclick = () => this.exportData('csv');
        
        const btnExportJSON = toolbar3.createEl('button', { cls: 'df-btn-export' });
        setIcon(btnExportJSON, 'braces');
        btnExportJSON.createSpan({ text: ' JSON' });
        btnExportJSON.onclick = () => this.exportData('json');
        
        const btnExportExcel = toolbar3.createEl('button', { cls: 'df-btn-export' });
        setIcon(btnExportExcel, 'table');
        btnExportExcel.createSpan({ text: ' Excel' });
        btnExportExcel.onclick = () => this.exportData('excel');
        
        const btnExportMD = toolbar3.createEl('button', { cls: 'df-btn-export' });
        setIcon(btnExportMD, 'file-code');
        btnExportMD.createSpan({ text: ' Markdown' });
        btnExportMD.onclick = () => this.exportData('markdown');
        
        const btnCopyClipboard = toolbar3.createEl('button', { cls: 'df-btn-export' });
        setIcon(btnCopyClipboard, 'clipboard');
        btnCopyClipboard.createSpan({ text: ' Copy' });
        btnCopyClipboard.onclick = () => this.copyToClipboard();
        
        const btnExportHTML = toolbar3.createEl('button', { cls: 'df-btn-export' });
        setIcon(btnExportHTML, 'code');
        btnExportHTML.createSpan({ text: ' HTML' });
        btnExportHTML.onclick = () => this.exportData('html');
        
        // Table container
        this.tableContainer = contentEl.createEl('div', { cls: 'df-table-container' });
        this.renderTable();
        
        // Pagination
        this.renderPagination(contentEl);
        
        // Draggable resizer between table and console
        const resizer = contentEl.createEl('div', { cls: 'df-console-resizer' });
        resizer.setAttribute('title', 'Drag to resize console');
        this.setupConsoleResizer(resizer, contentEl);
        
        // Console output area
        const consoleArea = contentEl.createEl('div', { cls: 'df-console-area' });
        const consoleHeader = consoleArea.createEl('div', { cls: 'df-console-header' });
        consoleHeader.createSpan({ text: '📋 Console Output', cls: 'df-console-title' });
        
        // Analysis & Anomaly tools in console header
        const consoleTools = consoleHeader.createEl('div', { cls: 'df-console-tools' });
        
        // Analysis dropdown
        const btnAnalyze = consoleTools.createEl('button', { text: '📊 Analyze ▾', cls: 'df-btn-mini' });
        btnAnalyze.setAttribute('title', 'Statistical analysis: describe, info, correlations');
        btnAnalyze.onclick = (e) => this.showAnalyzeOptions(e);
        
        // Anomaly dropdown
        const btnAnomalies = consoleTools.createEl('button', { text: '🔍 Anomalies ▾', cls: 'df-btn-mini' });
        btnAnomalies.setAttribute('title', 'Outlier & anomaly detection tools');
        btnAnomalies.onclick = (e) => this.showAnomalyOptions(e);
        
        const consoleActions = consoleHeader.createEl('div', { cls: 'df-console-actions' });
        
        // Heatmap toggle button
        const btnHeatmap = consoleActions.createEl('button', { cls: `df-btn-mini ${this.heatmapEnabled ? 'df-btn-active' : ''}` });
        setIcon(btnHeatmap, 'thermometer');
        btnHeatmap.createSpan({ text: ' Heatmap', cls: 'df-btn-text' });
        btnHeatmap.setAttribute('title', 'Toggle smart coloring for numeric values (highlights min/max/outliers)');
        btnHeatmap.onclick = () => {
            this.heatmapEnabled = !this.heatmapEnabled;
            btnHeatmap.classList.toggle('df-btn-active', this.heatmapEnabled);
            // Re-render console output with heatmap
            if (this.consoleOutput) {
                this.reRenderConsoleWithHeatmap();
            }
        };
        
        const btnClearConsole = consoleActions.createEl('button', { cls: 'df-btn-mini' });
        setIcon(btnClearConsole, 'trash-2');
        btnClearConsole.createSpan({ text: ' Clear', cls: 'df-btn-text' });
        btnClearConsole.setAttribute('title', 'Clear console output');
        btnClearConsole.onclick = () => {
            if (this.consoleOutput) this.consoleOutput.innerHTML = '';
        };
        
        const btnExpandConsole = consoleActions.createEl('button', { cls: 'df-btn-mini' });
        setIcon(btnExpandConsole, 'maximize-2');
        btnExpandConsole.setAttribute('title', 'Toggle console size');
        btnExpandConsole.onclick = () => {
            consoleArea.classList.toggle('df-console-expanded');
            setIcon(btnExpandConsole, consoleArea.classList.contains('df-console-expanded') ? 'minimize-2' : 'maximize-2');
        };
        
        this.consoleOutput = consoleArea.createEl('div', { cls: 'df-console-output' });
        
        // Command input area
        const inputArea = consoleArea.createEl('div', { cls: 'df-console-input-area' });
        const inputPrompt = inputArea.createEl('span', { text: '>>> ', cls: 'df-console-input-prompt' });
        const commandInput = inputArea.createEl('textarea', {
            placeholder: `Execute Python command on ${this.options.variableName}...`,
            cls: 'df-console-input',
        }) as HTMLTextAreaElement;
        commandInput.setAttr('rows', '1');
        commandInput.setAttr('spellcheck', 'false');
        commandInput.setAttr('autocomplete', 'off');
        commandInput.setAttr('autocorrect', 'off');
        commandInput.setAttr('autocapitalize', 'off');
        commandInput.setAttribute('title', 'Type a Python command and press Enter to execute. Shift+Enter = nouvelle ligne.');
        commandInput.style.resize = 'none';
        // Auto-resize function
        const autoResize = () => {
            commandInput.style.height = 'auto';
            commandInput.style.height = (commandInput.scrollHeight) + 'px';
        };
        commandInput.addEventListener('input', autoResize);
        setTimeout(autoResize, 1);
        
        const btnRun = inputArea.createEl('button', { cls: 'df-btn-run-cmd' });
        setIcon(btnRun, 'play');
        btnRun.setAttribute('title', 'Execute command');
        
        const executeCommand = async () => {
            const cmd = commandInput.value.trim();
            if (!cmd) return;
            
            // Add to history
            this.commandHistory.unshift(cmd);
            if (this.commandHistory.length > 50) this.commandHistory.pop();
            this.historyIndex = -1;
            
            // Hide autocomplete
            this.hideAutocomplete();
            
            // Show command
            this.appendToConsole(cmd, false, true);
            
            // Execute
            const result = await this.options.executePython(cmd, false);
            
            if (result.error) {
                this.appendToConsole(result.error, true);
            } else if (result.text) {
                this.appendToConsole(result.text, false, false, true);
            } else {
                this.appendToConsole('✅ Done (no output)');
            }
            
            // Clear input
            commandInput.value = '';
            
            // Refresh data if command might have modified it
            if (cmd.includes('=') || cmd.includes('drop') || cmd.includes('fill') || cmd.includes('reset')) {
                await this.refreshData();
            }
        };
        
        // Input event for autocomplete
        commandInput.oninput = () => {
            const cursorPos = commandInput.selectionStart || 0;
            const suggestions = this.getAutocompleteSuggestions(commandInput.value, cursorPos);
            if (suggestions.length > 0) {
                this.showAutocomplete(commandInput, suggestions);
            } else {
                this.hideAutocomplete();
            }
        };
        
        // Show suggestions on focus (even when empty)
        commandInput.onfocus = () => {
            const suggestions = this.getStarterSuggestions();
            if (commandInput.value.length === 0 && suggestions.length > 0) {
                this.showAutocomplete(commandInput, suggestions);
            }
        };
        
        commandInput.onkeydown = (e) => {
            // Shift+Enter = nouvelle ligne
            if (e.key === 'Enter' && e.shiftKey) {
                // Laisser le saut de ligne se faire
                setTimeout(autoResize, 1);
                return;
            }
            // Autocomplete navigation
            if (this.autocompleteContainer) {
                const items = this.autocompleteContainer.querySelectorAll('.df-autocomplete-item');
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.autocompleteIndex = Math.min(this.autocompleteIndex + 1, items.length - 1);
                    items.forEach((item, i) => item.classList.toggle('selected', i === this.autocompleteIndex));
                    return;
                } else if (e.key === 'ArrowUp' && this.autocompleteIndex >= 0) {
                    e.preventDefault();
                    this.autocompleteIndex = Math.max(this.autocompleteIndex - 1, 0);
                    items.forEach((item, i) => item.classList.toggle('selected', i === this.autocompleteIndex));
                    return;
                } else if (e.key === 'Tab' || (e.key === 'Enter' && this.autocompleteIndex >= 0)) {
                    e.preventDefault();
                    const selectedItem = items[this.autocompleteIndex >= 0 ? this.autocompleteIndex : 0];
                    if (selectedItem) {
                        this.applyAutocomplete(commandInput, selectedItem.textContent || '');
                    }
                    this.hideAutocomplete();
                    return;
                } else if (e.key === 'Escape') {
                    this.hideAutocomplete();
                    return;
                }
            }
            // Command history navigation
            if (e.key === 'ArrowUp' && !this.autocompleteContainer) {
                e.preventDefault();
                if (this.historyIndex < this.commandHistory.length - 1) {
                    this.historyIndex++;
                    commandInput.value = this.commandHistory[this.historyIndex];
                    autoResize();
                }
                return;
            } else if (e.key === 'ArrowDown' && !this.autocompleteContainer) {
                e.preventDefault();
                if (this.historyIndex > 0) {
                    this.historyIndex--;
                    commandInput.value = this.commandHistory[this.historyIndex];
                    autoResize();
                } else if (this.historyIndex === 0) {
                    this.historyIndex = -1;
                    commandInput.value = '';
                    autoResize();
                }
                return;
            }
            // Execute on Enter (sans Shift)
            if (e.key === 'Enter' && !e.shiftKey && !this.autocompleteContainer) {
                e.preventDefault();
                executeCommand();
            }
        };
        
        commandInput.onblur = () => {
            // Delay hiding to allow click on autocomplete item
            setTimeout(() => this.hideAutocomplete(), 150);
        };
        
        btnRun.onclick = executeCommand;
    }
    
    private setupConsoleResizer(resizer: HTMLElement, contentEl: HTMLElement) {
        let startY = 0;
        let startHeight = 0;
        const consoleArea = () => contentEl.querySelector('.df-console-area') as HTMLElement;
        
        const onMouseMove = (e: MouseEvent) => {
            const delta = startY - e.clientY;
            const newHeight = Math.max(150, Math.min(600, startHeight + delta));
            const area = consoleArea();
            if (area) {
                area.style.height = newHeight + 'px';
            }
        };
        
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            resizer.classList.remove('df-resizing');
        };
        
        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startY = e.clientY;
            const area = consoleArea();
            startHeight = area ? area.offsetHeight : 200;
            resizer.classList.add('df-resizing');
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }
    
    private renderTable() {
        if (!this.tableContainer) return;
        this.tableContainer.empty();
        
        // Get display data (handle transpose)
        const displayData = this.getDisplayData();
        const displayColumns = this.getDisplayColumns();
        
        const filteredData = this.getFilteredData();
        const sortedData = this.getSortedData(filteredData);
        const paginatedData = this.getPaginatedData(sortedData);
        
        const table = this.tableContainer.createEl('table', { cls: 'df-table' });
        
        // Header
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        
        // Index column
        const thIndex = headerRow.createEl('th', { cls: 'df-th-index' });
        thIndex.createSpan({ text: '#' });
        
        // Data columns with filter buttons
        displayColumns.forEach((col, colIdx) => {
            const th = headerRow.createEl('th', { cls: 'df-th' });
            const thWrapper = th.createEl('div', { cls: 'df-th-wrapper' });
            
            const thContent = thWrapper.createEl('div', { cls: 'df-th-content' });
            thContent.createSpan({ text: col, cls: 'df-th-name' });
            
            // Mark selected column
            if (this.selectedColumns.has(col)) {
                th.addClass('df-col-selected');
            }
            
            // Sort indicator
            if (this.sortColumn === col) {
                const sortIcon = thContent.createSpan({ cls: 'df-sort-icon' });
                setIcon(sortIcon, this.sortAscending ? 'chevron-up' : 'chevron-down');
            }
            
            // Filter button (Excel-style)
            const filterBtn = thWrapper.createEl('button', { cls: 'df-col-filter-btn' + (this.columnFilters.has(col) ? ' active' : '') });
            setIcon(filterBtn, 'filter');
            filterBtn.onclick = (e) => {
                e.stopPropagation();
                this.showColumnFilterDropdown(e, col, colIdx);
            };
            
            // Type badge
            const dtype = this.isTransposed ? 'object' : (this.data.dtypes[col] || 'object');
            const typeBadge = th.createEl('span', { 
                text: this.getShortType(dtype),
                cls: `df-type-badge df-type-${this.getTypeClass(dtype)}`
            });
            
            // Sort on header click
            thContent.onclick = (e) => {
                if (e.ctrlKey || e.metaKey) {
                    // Ctrl+click to select column
                    this.toggleColumnSelection(col);
                } else {
                    this.toggleSort(col);
                }
            };
            
            // Right-click context menu on header
            th.oncontextmenu = (e) => {
                e.preventDefault();
                this.showContextMenu(e, 'column', col, colIdx);
            };
        });
        
        // Body
        const tbody = table.createEl('tbody');
        
        if (paginatedData.length === 0) {
            const emptyRow = tbody.createEl('tr');
            const emptyCell = emptyRow.createEl('td', { 
                text: this.filterText || this.columnFilters.size > 0 ? 'No matching data' : 'No data to display',
                attr: { colspan: (displayColumns.length + 1).toString() }
            });
            emptyCell.addClass('df-empty-cell');
        } else {
            const effectivePageSize = this.pageSize > 0 ? this.pageSize : filteredData.length;
            paginatedData.forEach((row, rowIndex) => {
                const tr = tbody.createEl('tr');
                
                // Index
                const startIndex = (this.currentPage - 1) * effectivePageSize;
                const actualRowIndex = startIndex + rowIndex;
                const indexCell = tr.createEl('td', { 
                    text: actualRowIndex.toString(),
                    cls: 'df-td-index'
                });
                
                // Mark selected row
                if (this.selectedRows.has(actualRowIndex)) {
                    indexCell.addClass('df-row-selected');
                    tr.addClass('df-row-selected');
                }
                
                // Row selection in edit mode
                if (this.isEditMode) {
                    indexCell.addClass('df-cell-selectable');
                    indexCell.onclick = () => this.selectRow(actualRowIndex);
                }
                
                // Right-click context menu on row
                indexCell.oncontextmenu = (e) => {
                    e.preventDefault();
                    this.showContextMenu(e, 'row', '', 0, actualRowIndex);
                };
                
                // Data cells
                row.forEach((cell, colIndex) => {
                    const td = tr.createEl('td', { cls: 'df-td' });
                    const col = displayColumns[colIndex];
                    const dtype = this.isTransposed ? 'object' : (this.data.dtypes[col] || 'object');
                    const cellKey = `${actualRowIndex},${col}`;
                    
                    // Mark selected column
                    if (this.selectedColumns.has(col)) {
                        td.addClass('df-col-selected');
                    }
                    
                    // Mark selected row
                    if (this.selectedRows.has(actualRowIndex)) {
                        td.addClass('df-row-selected');
                    }
                    
                    // Check if this cell has pending changes
                    const pendingValue = this.pendingChanges.get(cellKey);
                    const displayValue = pendingValue !== undefined ? pendingValue : cell;
                    
                    if (displayValue === null || displayValue === undefined || displayValue === 'NaN' || (typeof displayValue === 'number' && isNaN(displayValue))) {
                        td.createSpan({ text: 'null', cls: 'df-null' });
                    } else {
                        const cellText = this.formatCell(displayValue, dtype);
                        td.createSpan({ 
                            text: cellText,
                            cls: `df-cell-${this.getTypeClass(dtype)}`
                        });
                        
                        // Highlight if matches filter
                        if (this.filterText && String(displayValue).toLowerCase().includes(this.filterText.toLowerCase())) {
                            td.addClass('df-cell-highlight');
                        }
                    }
                    
                    // Mark as modified
                    if (pendingValue !== undefined) {
                        td.addClass('df-cell-modified');
                    }
                    
                    // Edit mode: make cells editable
                    if (this.isEditMode) {
                        td.addClass('df-cell-editable');
                        td.onclick = (e) => {
                            e.stopPropagation();
                            this.editCell(td, actualRowIndex, colIndex, col, displayValue, dtype);
                        };
                    }
                    
                    // Right-click context menu on cell
                    td.oncontextmenu = (e) => {
                        e.preventDefault();
                        this.showContextMenu(e, 'cell', col, colIndex, actualRowIndex, displayValue);
                    };
                });
            });
        }
        
        // Update pagination
        this.updatePagination(filteredData.length);
    }
    
    // Get display columns (handles transpose)
    private getDisplayColumns(): string[] {
        if (this.isTransposed) {
            return Array.from({ length: this.data.shape[0] }, (_, i) => `Row ${i}`);
        }
        return this.data.columns;
    }
    
    // Python syntax highlighting - returns HTML with colored tokens
    private highlightPythonSyntax(code: string): string {
        // Tokenize the code first, then apply highlighting
        // This avoids issues with HTML escaping
        
        const tokens: Array<{ text: string, cls: string }> = [];
        let remaining = code;
        
        while (remaining.length > 0) {
            let matched = false;
            
            // Try to match each pattern
            // Comments
            let match = remaining.match(/^(#.*)$/m);
            if (match && match.index === 0) {
                tokens.push({ text: match[0], cls: 'py-comment' });
                remaining = remaining.slice(match[0].length);
                matched = true;
                continue;
            }
            
            // Triple-quoted strings
            match = remaining.match(/^("""[\s\S]*?"""|'''[\s\S]*?''')/);
            if (match) {
                tokens.push({ text: match[0], cls: 'py-string' });
                remaining = remaining.slice(match[0].length);
                matched = true;
                continue;
            }
            
            // Single/double quoted strings
            match = remaining.match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
            if (match) {
                tokens.push({ text: match[0], cls: 'py-string' });
                remaining = remaining.slice(match[0].length);
                matched = true;
                continue;
            }
            
            // Keywords
            match = remaining.match(/^(True|False|None|and|or|not|in|is|if|elif|else|for|while|break|continue|return|def|class|import|from|as|try|except|finally|raise|with|lambda|yield|pass|assert|global|nonlocal|del)\b/);
            if (match) {
                tokens.push({ text: match[0], cls: 'py-keyword' });
                remaining = remaining.slice(match[0].length);
                matched = true;
                continue;
            }
            
            // Pandas/NumPy libraries
            match = remaining.match(/^(pd|np|df|DataFrame|Series|Index|numpy|pandas|scipy|sklearn)\b/);
            if (match) {
                tokens.push({ text: match[0], cls: 'py-library' });
                remaining = remaining.slice(match[0].length);
                matched = true;
                continue;
            }
            
            // Built-in functions (followed by parenthesis)
            match = remaining.match(/^(print|len|range|type|str|int|float|list|dict|set|tuple|bool|sum|min|max|abs|round|sorted|enumerate|zip|map|filter|open|input|format|isinstance|hasattr|getattr|setattr)(?=\s*\()/);
            if (match) {
                tokens.push({ text: match[0], cls: 'py-builtin' });
                remaining = remaining.slice(match[0].length);
                matched = true;
                continue;
            }
            
            // Numbers
            match = remaining.match(/^(\d+\.?\d*(?:e[+-]?\d+)?)/i);
            if (match) {
                tokens.push({ text: match[0], cls: 'py-number' });
                remaining = remaining.slice(match[0].length);
                matched = true;
                continue;
            }
            
            // Method calls (after dot)
            match = remaining.match(/^\.([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()/);
            if (match) {
                tokens.push({ text: '.', cls: '' });
                tokens.push({ text: match[1], cls: 'py-method' });
                remaining = remaining.slice(match[0].length);
                matched = true;
                continue;
            }
            
            // Property access (after dot, not followed by parenthesis)
            match = remaining.match(/^\.([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (match) {
                tokens.push({ text: '.', cls: '' });
                tokens.push({ text: match[1], cls: 'py-property' });
                remaining = remaining.slice(match[0].length);
                matched = true;
                continue;
            }
            
            // Operators
            match = remaining.match(/^([+\-*\/%=<>!&|^~@]+)/);
            if (match) {
                tokens.push({ text: match[0], cls: 'py-operator' });
                remaining = remaining.slice(match[0].length);
                matched = true;
                continue;
            }
            
            // Identifiers (variable names, etc.)
            match = remaining.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (match) {
                tokens.push({ text: match[0], cls: '' });
                remaining = remaining.slice(match[0].length);
                matched = true;
                continue;
            }
            
            // If nothing matched, consume one character
            if (!matched) {
                tokens.push({ text: remaining[0], cls: '' });
                remaining = remaining.slice(1);
            }
        }
        
        // Build HTML from tokens
        return tokens.map(t => {
            const escaped = this.escapeHtml(t.text);
            return t.cls ? `<span class="${t.cls}">${escaped}</span>` : escaped;
        }).join('');
    }
    
    // Extract columns from table output text (for smart learning)
    private extractColumnsFromOutput(text: string): void {
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) return;
        
        // Try to detect table header - look for consistent spacing patterns
        for (let i = 0; i < Math.min(5, lines.length); i++) {
            const line = lines[i];
            
            // Skip lines that look like titles or separators
            if (line.startsWith('===') || line.startsWith('---') || line.includes(':')) continue;
            
            // Check if this looks like a header row (words separated by spaces)
            const potentialCols = line.trim().split(/\s{2,}/).filter(c => c.trim());
            
            // Headers usually have multiple columns and no pure numbers
            if (potentialCols.length >= 2) {
                const hasNonNumeric = potentialCols.some(c => !/^-?\d+\.?\d*$/.test(c.trim()));
                
                if (hasNonNumeric) {
                    // Check if next line looks like data (has numbers)
                    const nextLine = lines[i + 1];
                    if (nextLine) {
                        const nextParts = nextLine.trim().split(/\s{2,}/);
                        const hasNumbers = nextParts.some(p => /^-?\d+\.?\d*$/.test(p.trim()));
                        
                        if (hasNumbers || nextParts.length >= potentialCols.length - 1) {
                            // This looks like a valid header
                            potentialCols.forEach(col => {
                                const colName = col.trim();
                                if (colName && colName.length > 0 && colName.length < 50 && !/^\d+$/.test(colName)) {
                                    const existing = this.discoveredColumns.get(colName);
                                    this.discoveredColumns.set(colName, {
                                        source: 'output',
                                        count: existing ? existing.count + 1 : 1
                                    });
                                }
                            });
                            break; // Found header, stop searching
                        }
                    }
                }
            }
        }
        
        // Also detect variable assignments like: result = df.method()
        const assignmentMatch = text.match(/^(\w+)\s*=/);
        if (assignmentMatch) {
            this.discoveredVariables.add(assignmentMatch[1]);
        }
    }
    
    // Get all known columns (original + discovered)
    private getAllKnownColumns(): string[] {
        const allCols = new Set(this.data.columns);
        this.discoveredColumns.forEach((info, col) => allCols.add(col));
        return Array.from(allCols);
    }
    
    // Smart autocomplete with context awareness
    private getAutocompleteSuggestions(input: string, cursorPos: number): string[] {
        const varName = this.options.variableName;
        const textBeforeCursor = input.substring(0, cursorPos);
        const allColumns = this.getAllKnownColumns();
        
        // Find context - what method/pattern are we in?
        const lastDotIndex = textBeforeCursor.lastIndexOf('.');
        const lastBracketIndex = textBeforeCursor.lastIndexOf('[');
        const lastParenIndex = textBeforeCursor.lastIndexOf('(');
        
        // Detect if we're inside a method call
        const methodMatch = textBeforeCursor.match(/\.(\w+)\s*\(\s*([^)]*?)$/);
        const currentMethod = methodMatch ? methodMatch[1] : null;
        const insideMethodArgs = methodMatch ? methodMatch[2] : '';
        
        // 1. Inside brackets - suggest columns
        if (lastBracketIndex > lastDotIndex && lastBracketIndex > lastParenIndex) {
            const afterBracket = textBeforeCursor.substring(lastBracketIndex + 1).replace(/['"]/g, '');
            const matchingCols = allColumns
                .filter(col => col.toLowerCase().includes(afterBracket.toLowerCase()))
                .sort((a, b) => {
                    // Prioritize exact prefix match
                    const aStarts = a.toLowerCase().startsWith(afterBracket.toLowerCase()) ? 0 : 1;
                    const bStarts = b.toLowerCase().startsWith(afterBracket.toLowerCase()) ? 0 : 1;
                    if (aStarts !== bStarts) return aStarts - bStarts;
                    // Then by frequency from discovered columns
                    const aCount = this.discoveredColumns.get(a)?.count || 0;
                    const bCount = this.discoveredColumns.get(b)?.count || 0;
                    return bCount - aCount;
                });
            return matchingCols.slice(0, 15).map(col => `"${col}"]`);
        }
        
        // 2. Inside method arguments - smart suggestions based on method
        if (currentMethod && lastParenIndex > lastDotIndex) {
            const suggestions: string[] = [];
            
            // Get smart patterns for this method
            const patterns = DataFrameViewerModal.SMART_PATTERNS[currentMethod] || [];
            const afterLastComma = insideMethodArgs.split(',').pop()?.trim() || '';
            
            // Add method-specific suggestions
            patterns.filter(p => p.toLowerCase().includes(afterLastComma.toLowerCase()))
                .forEach(p => suggestions.push(p));
            
            // For methods that accept column names, suggest columns
            const methodsNeedingColumns = ['groupby', 'sort_values', 'pivot_table', 'merge', 'drop', 'rename', 'agg'];
            if (methodsNeedingColumns.includes(currentMethod)) {
                // Check if we need a column inside quotes
                const needsQuote = !afterLastComma.includes('"') && !afterLastComma.includes("'");
                allColumns.slice(0, 10).forEach(col => {
                    if (col.toLowerCase().includes(afterLastComma.toLowerCase())) {
                        suggestions.push(needsQuote ? `"${col}"` : col);
                    }
                });
            }
            
            // For query() method, suggest column-based conditions
            if (currentMethod === 'query') {
                allColumns.slice(0, 5).forEach(col => {
                    if (!insideMethodArgs.includes(col)) {
                        suggestions.push(`${col} > `);
                        suggestions.push(`${col} == `);
                    }
                });
            }
            
            return suggestions.slice(0, 12);
        }
        
        // 3. After a dot - suggest methods
        if (lastDotIndex >= 0 && lastDotIndex > lastBracketIndex) {
            const afterDot = textBeforeCursor.substring(lastDotIndex + 1);
            
            // Combine standard methods with context-aware suggestions
            let methods = [...DataFrameViewerModal.PANDAS_METHODS];
            
            // Add recently used patterns
            this.recentOperations.forEach(op => {
                if (!methods.includes(op)) methods.unshift(op);
            });
            
            const matching = methods
                .filter(m => m.toLowerCase().startsWith(afterDot.toLowerCase()))
                .slice(0, 15);
            
            return matching;
        }
        
        // 4. Start of expression or after space
        const lastWord = textBeforeCursor.split(/[\s(,=\[]+/).pop() || '';
        const suggestions: string[] = [];
        
        // Suggest main variable
        if (varName.toLowerCase().startsWith(lastWord.toLowerCase())) {
            suggestions.push(varName);
        }
        
        // Suggest discovered variables
        this.discoveredVariables.forEach(v => {
            if (v.toLowerCase().startsWith(lastWord.toLowerCase()) && v !== varName) {
                suggestions.push(v);
            }
        });
        
        // Quick access to columns
        if (lastWord.length === 0) {
            // Most common operations
            suggestions.push(
                `${varName}.describe()`,
                `${varName}.head(10)`,
                `${varName}.info()`,
                `${varName}.shape`,
                `${varName}.columns.tolist()`,
                `${varName}.dtypes`,
                `${varName}.isnull().sum()`,
            );
            
            // Top columns quick access
            allColumns.slice(0, 3).forEach(col => {
                suggestions.push(`${varName}["${col}"]`);
            });
        }
        
        return suggestions.slice(0, 12);
    }
    
    // Get starter suggestions when input is empty (on focus)
    private getStarterSuggestions(): string[] {
        const varName = this.options.variableName;
        const suggestions: string[] = [];
        
        // Section: Quick Info
        suggestions.push(
            `${varName}`,
            `${varName}.head()`,
            `${varName}.tail()`,
            `${varName}.describe()`,
            `${varName}.info()`,
            `${varName}.shape`,
            `${varName}.columns.tolist()`,
            `${varName}.dtypes`,
        );
        
        // Section: Data Quality
        suggestions.push(
            `${varName}.isnull().sum()`,
            `${varName}.duplicated().sum()`,
            `${varName}.nunique()`,
        );
        
        // Section: Statistics
        suggestions.push(
            `${varName}.mean()`,
            `${varName}.std()`,
            `${varName}.corr()`,
            `${varName}.value_counts()`,
        );
        
        // Section: Filtering/Selection
        suggestions.push(
            `${varName}.query("")`,
            `${varName}.loc[]`,
            `${varName}.iloc[]`,
            `${varName}.groupby()`,
            `${varName}.sort_values()`,
        );
        
        // Top columns quick access
        const cols = [...this.data.columns, ...Array.from(this.discoveredColumns)];
        cols.slice(0, 5).forEach(col => {
            suggestions.push(`${varName}["${col}"]`);
        });
        
        return suggestions;
    }
    
    // Categorize suggestion for display
    private categorizeSuggestion(suggestion: string): { icon: string, type: string, highlight: string } {
        // Column reference
        if (suggestion.includes('["') || suggestion.startsWith('"')) {
            const colMatch = suggestion.match(/"([^"]+)"/);
            const colName = colMatch ? colMatch[1] : suggestion;
            const isDiscovered = this.discoveredColumns.has(colName);
            return { 
                icon: isDiscovered ? '🔍' : '📊', 
                type: 'column',
                highlight: isDiscovered ? 'discovered' : 'original'
            };
        }
        
        // Method call
        if (suggestion.includes('()')) {
            // Categorize by method type
            if (['describe', 'info', 'head', 'tail', 'shape', 'dtypes', 'columns'].some(m => suggestion.includes(m))) {
                return { icon: 'ℹ️', type: 'info', highlight: 'info' };
            }
            if (['mean', 'sum', 'count', 'std', 'var', 'min', 'max', 'median'].some(m => suggestion.includes(m))) {
                return { icon: '📈', type: 'stats', highlight: 'stats' };
            }
            if (['groupby', 'pivot', 'merge', 'concat', 'join'].some(m => suggestion.includes(m))) {
                return { icon: '🔗', type: 'transform', highlight: 'transform' };
            }
            if (['plot', 'hist', 'boxplot', 'scatter'].some(m => suggestion.includes(m))) {
                return { icon: '📉', type: 'viz', highlight: 'viz' };
            }
            if (['drop', 'fill', 'replace', 'rename', 'reset'].some(m => suggestion.includes(m))) {
                return { icon: '✏️', type: 'modify', highlight: 'modify' };
            }
            return { icon: '⚡', type: 'method', highlight: 'method' };
        }
        
        // Property (no parentheses)
        if (suggestion.includes('.') && !suggestion.includes('(')) {
            return { icon: '📌', type: 'property', highlight: 'property' };
        }
        
        // Parameter
        if (suggestion.includes('=')) {
            return { icon: '⚙️', type: 'param', highlight: 'param' };
        }
        
        // Variable
        return { icon: '📦', type: 'variable', highlight: 'variable' };
    }
    
    // Show autocomplete dropdown with rich formatting
    private showAutocomplete(input: HTMLInputElement | HTMLTextAreaElement, suggestions: string[]): void {
        this.hideAutocomplete();
        
        if (suggestions.length === 0) return;
        
        const rect = input.getBoundingClientRect();
        
        this.autocompleteContainer = document.createElement('div');
        this.autocompleteContainer.className = 'df-autocomplete-dropdown';
        this.autocompleteContainer.style.position = 'fixed';
        this.autocompleteContainer.style.left = rect.left + 'px';
        this.autocompleteContainer.style.bottom = (window.innerHeight - rect.top + 5) + 'px';
        this.autocompleteContainer.style.minWidth = Math.max(rect.width, 280) + 'px';
        this.autocompleteContainer.style.zIndex = '10002';
        
        suggestions.forEach((suggestion, idx) => {
            const category = this.categorizeSuggestion(suggestion);
            
            const item = this.autocompleteContainer!.createEl('div', {
                cls: `df-autocomplete-item df-autocomplete-${category.highlight}`
            });
            
            // Icon
            item.createSpan({ text: category.icon + ' ', cls: 'df-autocomplete-icon' });
            
            // Suggestion text with highlighting
            const textSpan = item.createSpan({ cls: 'df-autocomplete-text' });
            
            // Highlight the matching part
            const inputText = input.value.toLowerCase();
            const suggestionLower = suggestion.toLowerCase();
            const matchIdx = suggestionLower.indexOf(inputText.split(/[\s.(\[]+/).pop() || '');
            
            if (matchIdx >= 0 && inputText.length > 0) {
                const matchLen = inputText.split(/[\s.(\[]+/).pop()?.length || 0;
                textSpan.innerHTML = 
                    this.escapeHtml(suggestion.substring(0, matchIdx)) +
                    `<strong>${this.escapeHtml(suggestion.substring(matchIdx, matchIdx + matchLen))}</strong>` +
                    this.escapeHtml(suggestion.substring(matchIdx + matchLen));
            } else {
                textSpan.textContent = suggestion;
            }
            
            // Type badge for discovered columns
            if (category.highlight === 'discovered') {
                item.createSpan({ text: ' NEW', cls: 'df-autocomplete-badge' });
            }
            
            if (idx === this.autocompleteIndex) {
                item.addClass('selected');
            }
            
            item.onclick = () => {
                this.applyAutocomplete(input, suggestion);
                this.hideAutocomplete();
            };
        });
        
        // Keyboard hint at bottom
        const hint = this.autocompleteContainer.createEl('div', { 
            cls: 'df-autocomplete-hint',
            text: '↑↓ Navigate • Tab/Enter Select • Esc Close'
        });
        
        document.body.appendChild(this.autocompleteContainer);
    }
    
    // Apply selected autocomplete
    private applyAutocomplete(input: HTMLInputElement | HTMLTextAreaElement, suggestion: string): void {
        const cursorPos = input.selectionStart || 0;
        const text = input.value;
        
        // Find what to replace
        const beforeCursor = text.substring(0, cursorPos);
        const afterCursor = text.substring(cursorPos);
        
        // Handle different completion types
        if (suggestion.startsWith('["')) {
            // Column completion
            const lastBracket = beforeCursor.lastIndexOf('[');
            const newText = beforeCursor.substring(0, lastBracket) + suggestion + afterCursor;
            input.value = newText;
            input.setSelectionRange(newText.length - afterCursor.length, newText.length - afterCursor.length);
        } else if (beforeCursor.includes('.') && !suggestion.includes('.')) {
            // Method completion after dot
            const lastDot = beforeCursor.lastIndexOf('.');
            const newText = beforeCursor.substring(0, lastDot + 1) + suggestion + afterCursor;
            input.value = newText;
            // Position cursor before () if present
            const parenPos = suggestion.indexOf('(');
            if (parenPos > 0) {
                const newPos = lastDot + 1 + parenPos + 1;
                input.setSelectionRange(newPos, newPos);
            }
        } else {
            // Full replacement
            const lastWord = beforeCursor.split(/[\s(,=]+/).pop() || '';
            const newText = beforeCursor.substring(0, beforeCursor.length - lastWord.length) + suggestion + afterCursor;
            input.value = newText;
        }
        
        input.focus();
    }
    
    // Hide autocomplete dropdown
    private hideAutocomplete(): void {
        if (this.autocompleteContainer) {
            this.autocompleteContainer.remove();
            this.autocompleteContainer = null;
        }
        this.autocompleteIndex = -1;
    }
    
    // Position dropdown menu intelligently (up or down based on viewport)
    private positionDropdownMenu(menu: HTMLElement, targetRect: DOMRect, preferUp: boolean = false): void {
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const menuHeight = 300; // Estimated max height
        const menuWidth = 250; // Estimated max width
        const margin = 10;
        
        menu.style.position = 'fixed';
        menu.style.zIndex = '10001';
        
        // Calculate available space above and below
        const spaceBelow = viewportHeight - targetRect.bottom - margin;
        const spaceAbove = targetRect.top - margin;
        
        // Decide whether to show above or below
        if (preferUp || (spaceBelow < menuHeight && spaceAbove > spaceBelow)) {
            // Show above
            menu.style.bottom = (viewportHeight - targetRect.top + 5) + 'px';
            menu.style.top = 'auto';
            menu.style.maxHeight = Math.min(spaceAbove - margin, 400) + 'px';
        } else {
            // Show below (default)
            menu.style.top = (targetRect.bottom + 5) + 'px';
            menu.style.bottom = 'auto';
            menu.style.maxHeight = Math.min(spaceBelow - margin, 400) + 'px';
        }
        
        // Horizontal positioning - prevent overflow right
        let leftPos = targetRect.left;
        if (leftPos + menuWidth > viewportWidth - margin) {
            leftPos = viewportWidth - menuWidth - margin;
        }
        if (leftPos < margin) {
            leftPos = margin;
        }
        menu.style.left = leftPos + 'px';
    }
    
    // Get display data (handles transpose)
    private getDisplayData(): any[][] {
        if (this.isTransposed) {
            // Transpose: columns become rows
            const transposed: any[][] = [];
            for (let c = 0; c < this.data.columns.length; c++) {
                const row: any[] = [this.data.columns[c]];
                for (let r = 0; r < this.data.data.length; r++) {
                    row.push(this.data.data[r][c]);
                }
                transposed.push(row);
            }
            return transposed;
        }
        return this.data.data;
    }
    
    // Show Excel-style column filter dropdown
    private showColumnFilterDropdown(e: MouseEvent, column: string, colIndex: number) {
        // Remove existing dropdown
        document.querySelectorAll('.df-column-filter-dropdown').forEach(el => el.remove());
        
        const dropdown = document.createElement('div');
        dropdown.className = 'df-column-filter-dropdown';
        
        // Get unique values for this column
        const uniqueValues = new Set<any>();
        const displayData = this.getDisplayData();
        displayData.forEach(row => {
            const val = row[colIndex];
            uniqueValues.add(val === null || val === undefined ? '__NULL__' : val);
        });
        
        const sortedValues = Array.from(uniqueValues).sort((a, b) => {
            if (a === '__NULL__') return 1;
            if (b === '__NULL__') return -1;
            return String(a).localeCompare(String(b));
        });
        
        // Header
        const header = dropdown.createEl('div', { cls: 'df-filter-header' });
        header.createEl('span', { text: `Filter: ${column}`, cls: 'df-filter-title' });
        
        // Select all / Clear
        const actions = dropdown.createEl('div', { cls: 'df-filter-actions' });
        const btnSelectAll = actions.createEl('button', { text: 'All', cls: 'df-filter-action-btn' });
        btnSelectAll.onclick = () => {
            dropdown.querySelectorAll('input[type="checkbox"]').forEach((cb: HTMLInputElement) => cb.checked = true);
        };
        const btnClear = actions.createEl('button', { text: 'None', cls: 'df-filter-action-btn' });
        btnClear.onclick = () => {
            dropdown.querySelectorAll('input[type="checkbox"]').forEach((cb: HTMLInputElement) => cb.checked = false);
        };
        
        // Search in filter
        const searchInput = dropdown.createEl('input', { 
            type: 'text', 
            placeholder: 'Search values...', 
            cls: 'df-filter-search' 
        });
        searchInput.oninput = () => {
            const searchVal = searchInput.value.toLowerCase();
            dropdown.querySelectorAll('.df-filter-option').forEach((opt: HTMLElement) => {
                const text = opt.getAttribute('data-value') || '';
                opt.style.display = text.toLowerCase().includes(searchVal) ? 'flex' : 'none';
            });
        };
        
        // Values list
        const valuesList = dropdown.createEl('div', { cls: 'df-filter-values' });
        const currentFilter = this.columnFilters.get(column) || new Set();
        const hasFilter = this.columnFilters.has(column);
        
        sortedValues.slice(0, 200).forEach(val => { // Limit to 200 for performance
            const option = valuesList.createEl('label', { cls: 'df-filter-option' });
            option.setAttribute('data-value', String(val));
            
            const checkbox = option.createEl('input', { type: 'checkbox' });
            checkbox.checked = hasFilter ? currentFilter.has(val) : true;
            
            const displayVal = val === '__NULL__' ? '(null)' : String(val).substring(0, 50);
            option.createSpan({ text: displayVal });
        });
        
        if (sortedValues.length > 200) {
            valuesList.createEl('div', { 
                text: `... and ${sortedValues.length - 200} more values`, 
                cls: 'df-filter-more' 
            });
        }
        
        // Apply button
        const footer = dropdown.createEl('div', { cls: 'df-filter-footer' });
        const btnApply = footer.createEl('button', { text: 'Apply Filter', cls: 'df-filter-apply' });
        btnApply.onclick = () => {
            const selectedValues = new Set<any>();
            dropdown.querySelectorAll('.df-filter-option input:checked').forEach((cb: HTMLInputElement) => {
                const label = cb.closest('.df-filter-option');
                const val = label?.getAttribute('data-value');
                if (val === '__NULL__') {
                    selectedValues.add(null);
                    selectedValues.add(undefined);
                } else if (val !== null) {
                    // Try to parse as number if possible
                    const numVal = parseFloat(val);
                    selectedValues.add(isNaN(numVal) ? val : numVal);
                    selectedValues.add(val); // Also add string version
                }
            });
            
            if (selectedValues.size === sortedValues.length || selectedValues.size === 0) {
                this.columnFilters.delete(column);
            } else {
                this.columnFilters.set(column, selectedValues);
            }
            
            dropdown.remove();
            this.currentPage = 1;
            this.renderTable();
            this.renderModal(false);
        };
        
        const btnClearFilter = footer.createEl('button', { text: 'Clear Filter', cls: 'df-filter-clear' });
        btnClearFilter.onclick = () => {
            this.columnFilters.delete(column);
            dropdown.remove();
            this.currentPage = 1;
            this.renderTable();
            this.renderModal(false);
        };
        
        // Position dropdown
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        this.positionDropdownMenu(dropdown, rect);
        
        document.body.appendChild(dropdown);
        
        // Close on click outside
        const closeDropdown = (event: MouseEvent) => {
            if (!dropdown.contains(event.target as Node)) {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            }
        };
        setTimeout(() => document.addEventListener('click', closeDropdown), 10);
    }
    
    private renderPagination(container: HTMLElement) {
        const paginationEl = container.createEl('div', { cls: 'df-pagination' });
        paginationEl.id = 'df-pagination';
        this.updatePagination(this.data.data.length);
    }
    
    private updatePagination(totalRows: number) {
        const paginationEl = this.contentEl.querySelector('#df-pagination');
        if (!paginationEl) return;
        
        paginationEl.empty();
        
        const effectivePageSize = this.pageSize > 0 ? this.pageSize : totalRows;
        const totalPages = Math.ceil(totalRows / effectivePageSize);
        
        if (totalPages <= 1) return;
        
        // Previous button
        const btnPrev = paginationEl.createEl('button', { text: '←', cls: 'df-btn-page' });
        btnPrev.disabled = this.currentPage === 1;
        btnPrev.onclick = () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderTable();
            }
        };
        
        // Page info
        paginationEl.createEl('span', { 
            text: `Page ${this.currentPage} of ${totalPages}`,
            cls: 'df-page-info'
        });
        
        // Next button
        const btnNext = paginationEl.createEl('button', { text: '→', cls: 'df-btn-page' });
        btnNext.disabled = this.currentPage === totalPages;
        btnNext.onclick = () => {
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.renderTable();
            }
        };
        
        // Row range info
        const startRow = (this.currentPage - 1) * effectivePageSize + 1;
        const endRow = Math.min(this.currentPage * effectivePageSize, totalRows);
        paginationEl.createEl('span', { 
            text: `(${startRow}-${endRow} of ${totalRows})`,
            cls: 'df-row-info'
        });
    }
    
    private getFilteredData(): any[][] {
        const displayData = this.getDisplayData();
        const displayColumns = this.getDisplayColumns();
        
        let filtered = displayData;
        
        // Apply column filters (Excel-style)
        if (this.columnFilters.size > 0) {
            filtered = filtered.filter(row => {
                for (const [col, allowedValues] of this.columnFilters) {
                    const colIndex = displayColumns.indexOf(col);
                    if (colIndex === -1) continue;
                    
                    const cellValue = row[colIndex];
                    const cellStr = String(cellValue);
                    
                    // Check if value is allowed
                    let matches = false;
                    for (const allowed of allowedValues) {
                        if (allowed === null || allowed === undefined) {
                            if (cellValue === null || cellValue === undefined || cellValue === 'NaN') {
                                matches = true;
                                break;
                            }
                        } else if (cellValue === allowed || cellStr === String(allowed)) {
                            matches = true;
                            break;
                        }
                    }
                    if (!matches) return false;
                }
                return true;
            });
        }
        
        // Apply text filter
        if (this.filterText.trim()) {
            const searchLower = this.filterText.toLowerCase();
            filtered = filtered.filter(row => 
                row.some(cell => 
                    cell !== null && 
                    cell !== undefined && 
                    String(cell).toLowerCase().includes(searchLower)
                )
            );
        }
        
        return filtered;
    }
    
    private getSortedData(data: any[][]): any[][] {
        if (!this.sortColumn) return data;
        
        const displayColumns = this.getDisplayColumns();
        const colIndex = displayColumns.indexOf(this.sortColumn);
        if (colIndex === -1) return data;
        
        return [...data].sort((a, b) => {
            const valA = a[colIndex];
            const valB = b[colIndex];
            
            // Handle nulls
            if (valA === null || valA === undefined) return this.sortAscending ? 1 : -1;
            if (valB === null || valB === undefined) return this.sortAscending ? -1 : 1;
            
            // Compare values
            let comparison = 0;
            if (typeof valA === 'number' && typeof valB === 'number') {
                comparison = valA - valB;
            } else {
                comparison = String(valA).localeCompare(String(valB));
            }
            
            return this.sortAscending ? comparison : -comparison;
        });
    }
    
    private getPaginatedData(data: any[][]): any[][] {
        if (this.pageSize <= 0) return data;
        
        const start = (this.currentPage - 1) * this.pageSize;
        return data.slice(start, start + this.pageSize);
    }
    
    private toggleSort(column: string) {
        if (this.sortColumn === column) {
            this.sortAscending = !this.sortAscending;
        } else {
            this.sortColumn = column;
            this.sortAscending = true;
        }
        this.renderTable();
    }
    
    private toggleFullscreen() {
        // Sauvegarder la console output avant de changer le mode
        let oldConsole: HTMLElement | null = null;
        if (this.consoleOutput && this.consoleOutput.parentElement) {
            oldConsole = this.consoleOutput;
        }
        this.isFullscreen = !this.isFullscreen;
        if (this.isFullscreen) {
            this.contentEl.addClass('df-fullscreen');
        } else {
            this.contentEl.removeClass('df-fullscreen');
        }
        this.renderModal(false);
        // Restaurer la console output si elle existe
        if (oldConsole && !this.isFullscreen) {
            this.contentEl.appendChild(oldConsole);
        }
    }
    
    private formatCell(value: any, dtype: string): string {
        if (typeof value === 'number') {
            if (dtype.includes('float')) {
                return value.toFixed(4);
            }
            return value.toString();
        }
        
        const str = String(value);
        return str.length > 50 ? str.substring(0, 47) + '...' : str;
    }
    
    private getShortType(dtype: string): string {
        if (dtype.includes('int')) return 'int';
        if (dtype.includes('float')) return 'float';
        if (dtype.includes('bool')) return 'bool';
        if (dtype.includes('datetime')) return 'date';
        if (dtype.includes('object') || dtype.includes('str')) return 'str';
        return dtype.substring(0, 4);
    }
    
    private getTypeClass(dtype: string): string {
        if (dtype.includes('int')) return 'int';
        if (dtype.includes('float')) return 'float';
        if (dtype.includes('bool')) return 'bool';
        if (dtype.includes('datetime')) return 'date';
        return 'str';
    }
    
    private formatBytes(bytes: number): string {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
    
    private async runDSTool(tool: string, column?: string) {
        const varName = this.options.variableName;
        let code = '';
        
        switch (tool) {
            case 'dropna':
                code = `${varName} = ${varName}.dropna()\nprint(f"Rows after dropna: {len(${varName})}")`;
                break;
            case 'drop_duplicates':
                code = `${varName} = ${varName}.drop_duplicates()\nprint(f"Rows after drop_duplicates: {len(${varName})}")`;
                break;
            case 'describe':
                code = `print(${varName}.describe().to_string())`;
                break;
            case 'info':
                code = `
import io
import sys
buffer = io.StringIO()
${varName}.info(buf=buffer)
print(buffer.getvalue())
`;
                break;
            case 'corr':
                code = `print(${varName}.select_dtypes(include='number').corr().round(3).to_string())`;
                break;
            case 'reset_index':
                code = `${varName} = ${varName}.reset_index(drop=True)\nprint("Index reset successfully")`;
                break;
            case 'fillna_0':
                code = `${varName} = ${varName}.fillna(0)\nprint("NaN values filled with 0")`;
                break;
            case 'fillna_mean':
                code = `numeric_cols = ${varName}.select_dtypes(include='number').columns\n${varName}[numeric_cols] = ${varName}[numeric_cols].fillna(${varName}[numeric_cols].mean())\nprint("NaN values filled with mean")`;
                break;
            case 'fillna_median':
                code = `numeric_cols = ${varName}.select_dtypes(include='number').columns\n${varName}[numeric_cols] = ${varName}[numeric_cols].fillna(${varName}[numeric_cols].median())\nprint("NaN values filled with median")`;
                break;
            case 'fillna_mode':
                code = `for col in ${varName}.columns:\n    mode_val = ${varName}[col].mode()\n    if len(mode_val) > 0:\n        ${varName}[col] = ${varName}[col].fillna(mode_val[0])\nprint("NaN values filled with mode")`;
                break;
            case 'fillna_ffill':
                code = `${varName} = ${varName}.ffill()\nprint("NaN values forward filled")`;
                break;
            case 'fillna_bfill':
                code = `${varName} = ${varName}.bfill()\nprint("NaN values backward filled")`;
                break;
            case 'value_counts':
                if (column) {
                    code = `print(${varName}['${column}'].value_counts().head(50).to_string())`;
                }
                break;
            case 'unique':
                if (column) {
                    code = `vals = ${varName}['${column}'].unique()\nprint(f"Unique values ({len(vals)}):")\nprint(vals[:100])`;
                }
                break;
            
            // ========== ANOMALY DETECTION TOOLS ==========
            case 'zscore':
                code = `
import numpy as np
from scipy import stats
numeric_df = ${varName}.select_dtypes(include='number')
if len(numeric_df.columns) > 0:
    z_scores = np.abs(stats.zscore(numeric_df, nan_policy='omit'))
    z_df = pd.DataFrame(z_scores, columns=numeric_df.columns)
    print("=== Z-SCORES (values > 3 are potential outliers) ===\\n")
    print(z_df.describe().round(3).to_string())
    print("\\n=== OUTLIER COUNT (|Z| > 3) per column ===")
    outlier_counts = (z_df > 3).sum()
    print(outlier_counts.to_string())
else:
    print("No numeric columns found")
`;
                break;
            
            case 'quantiles':
                code = `
numeric_df = ${varName}.select_dtypes(include='number')
if len(numeric_df.columns) > 0:
    print("=== QUANTILE DISTRIBUTION ===\\n")
    quantiles = numeric_df.quantile([0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99])
    print(quantiles.round(4).to_string())
    print("\\n=== RANGE ANALYSIS ===")
    range_df = pd.DataFrame({
        'Min': numeric_df.min(),
        'Max': numeric_df.max(),
        'Range': numeric_df.max() - numeric_df.min(),
        'IQR': numeric_df.quantile(0.75) - numeric_df.quantile(0.25)
    })
    print(range_df.round(4).to_string())
else:
    print("No numeric columns found")
`;
                break;
            
            case 'skew_kurt':
                code = `
numeric_df = ${varName}.select_dtypes(include='number')
if len(numeric_df.columns) > 0:
    print("=== DISTRIBUTION SHAPE ANALYSIS ===\\n")
    print("Skewness (0 = symmetric, >1 or <-1 = highly skewed)")
    print("Kurtosis (0 = normal, >3 = heavy tails, <3 = light tails)\\n")
    shape_df = pd.DataFrame({
        'Skewness': numeric_df.skew(),
        'Kurtosis': numeric_df.kurtosis(),
        'Is_Skewed': abs(numeric_df.skew()) > 1,
        'Heavy_Tails': numeric_df.kurtosis() > 3
    })
    print(shape_df.round(4).to_string())
    print("\\n=== POTENTIAL ISSUES ===")
    skewed = shape_df[shape_df['Is_Skewed'] == True].index.tolist()
    heavy = shape_df[shape_df['Heavy_Tails'] == True].index.tolist()
    if skewed:
        print(f"Highly skewed columns: {', '.join(skewed)}")
    if heavy:
        print(f"Heavy-tailed columns: {', '.join(heavy)}")
    if not skewed and not heavy:
        print("No major distribution issues detected")
else:
    print("No numeric columns found")
`;
                break;
            
            case 'outliers_iqr':
                code = `
numeric_df = ${varName}.select_dtypes(include='number')
if len(numeric_df.columns) > 0:
    print("=== IQR OUTLIER DETECTION ===\\n")
    Q1 = numeric_df.quantile(0.25)
    Q3 = numeric_df.quantile(0.75)
    IQR = Q3 - Q1
    lower = Q1 - 1.5 * IQR
    upper = Q3 + 1.5 * IQR
    
    outlier_df = pd.DataFrame({
        'Lower_Bound': lower,
        'Upper_Bound': upper,
        'Outliers_Low': ((numeric_df < lower).sum()),
        'Outliers_High': ((numeric_df > upper).sum()),
        'Total_Outliers': ((numeric_df < lower) | (numeric_df > upper)).sum(),
        'Outlier_%': (((numeric_df < lower) | (numeric_df > upper)).sum() / len(numeric_df) * 100).round(2)
    })
    print(outlier_df.to_string())
    
    total = outlier_df['Total_Outliers'].sum()
    print(f"\\nTotal outliers across all columns: {total}")
else:
    print("No numeric columns found")
`;
                break;
            
            case 'outliers_zscore':
                code = `
import numpy as np
from scipy import stats
numeric_df = ${varName}.select_dtypes(include='number')
if len(numeric_df.columns) > 0:
    print("=== Z-SCORE OUTLIER DETECTION (|Z| > 3) ===\\n")
    z_scores = pd.DataFrame(np.abs(stats.zscore(numeric_df, nan_policy='omit')), columns=numeric_df.columns)
    
    outlier_df = pd.DataFrame({
        'Mean': numeric_df.mean(),
        'Std': numeric_df.std(),
        'Outlier_Count': (z_scores > 3).sum(),
        'Outlier_%': ((z_scores > 3).sum() / len(z_scores) * 100).round(2)
    })
    print(outlier_df.round(4).to_string())
    
    # Show actual outlier values
    print("\\n=== OUTLIER VALUES ===")
    for col in numeric_df.columns:
        outlier_mask = z_scores[col] > 3
        if outlier_mask.sum() > 0:
            outlier_vals = numeric_df.loc[outlier_mask.values, col].head(10)
            print(f"\\n{col}: {outlier_vals.tolist()}")
else:
    print("No numeric columns found")
`;
                break;
            
            case 'outliers_isolation_forest':
                code = `
from sklearn.ensemble import IsolationForest
numeric_df = ${varName}.select_dtypes(include='number').dropna()
if len(numeric_df.columns) > 0 and len(numeric_df) > 10:
    print("=== ISOLATION FOREST ANOMALY DETECTION ===\\n")
    iso = IsolationForest(contamination=0.05, random_state=42)
    predictions = iso.fit_predict(numeric_df)
    anomaly_scores = iso.decision_function(numeric_df)
    
    n_anomalies = (predictions == -1).sum()
    print(f"Detected anomalies: {n_anomalies} ({n_anomalies/len(predictions)*100:.2f}%)")
    
    # Show most anomalous rows
    result_df = ${varName}.loc[numeric_df.index].copy()
    result_df['Anomaly_Score'] = anomaly_scores
    result_df['Is_Anomaly'] = predictions == -1
    
    print("\\n=== TOP 10 MOST ANOMALOUS ROWS ===")
    print(result_df.nsmallest(10, 'Anomaly_Score').to_string())
else:
    print("Need numeric columns with at least 10 rows for Isolation Forest")
`;
                break;
            
            case 'outliers_lof':
                code = `
from sklearn.neighbors import LocalOutlierFactor
numeric_df = ${varName}.select_dtypes(include='number').dropna()
if len(numeric_df.columns) > 0 and len(numeric_df) > 10:
    print("=== LOCAL OUTLIER FACTOR (LOF) DETECTION ===\\n")
    lof = LocalOutlierFactor(n_neighbors=20, contamination=0.05)
    predictions = lof.fit_predict(numeric_df)
    lof_scores = -lof.negative_outlier_factor_
    
    n_anomalies = (predictions == -1).sum()
    print(f"Detected anomalies: {n_anomalies} ({n_anomalies/len(predictions)*100:.2f}%)")
    
    # Show most anomalous rows
    result_df = ${varName}.loc[numeric_df.index].copy()
    result_df['LOF_Score'] = lof_scores
    result_df['Is_Anomaly'] = predictions == -1
    
    print("\\n=== TOP 10 MOST ANOMALOUS ROWS (highest LOF) ===")
    print(result_df.nlargest(10, 'LOF_Score').to_string())
else:
    print("Need numeric columns with at least 10 rows for LOF")
`;
                break;
            
            case 'outliers_dbscan':
                code = `
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler
numeric_df = ${varName}.select_dtypes(include='number').dropna()
if len(numeric_df.columns) > 0 and len(numeric_df) > 10:
    print("=== DBSCAN CLUSTERING ANOMALY DETECTION ===\\n")
    print("Points labeled as -1 are noise/outliers\\n")
    
    # Standardize data
    scaler = StandardScaler()
    scaled_data = scaler.fit_transform(numeric_df)
    
    # DBSCAN clustering
    dbscan = DBSCAN(eps=0.5, min_samples=5)
    labels = dbscan.fit_predict(scaled_data)
    
    n_outliers = (labels == -1).sum()
    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    
    print(f"Clusters found: {n_clusters}")
    print(f"Outliers (noise): {n_outliers} ({n_outliers/len(labels)*100:.2f}%)")
    
    # Show outlier rows
    result_df = ${varName}.loc[numeric_df.index].copy()
    result_df['Cluster'] = labels
    
    outlier_df = result_df[result_df['Cluster'] == -1]
    if len(outlier_df) > 0:
        print("\\n=== OUTLIER ROWS (cluster = -1) ===")
        print(outlier_df.head(15).to_string())
else:
    print("Need numeric columns with at least 10 rows for DBSCAN")
`;
                break;
            
            case 'outliers_mahalanobis':
                code = `
import numpy as np
from scipy import stats
numeric_df = ${varName}.select_dtypes(include='number').dropna()
if len(numeric_df.columns) > 1 and len(numeric_df) > len(numeric_df.columns):
    print("=== MAHALANOBIS DISTANCE ANOMALY DETECTION ===\\n")
    print("Measures distance accounting for correlations between variables\\n")
    
    # Calculate Mahalanobis distance
    mean = numeric_df.mean().values
    cov = numeric_df.cov().values
    
    try:
        cov_inv = np.linalg.inv(cov)
        
        mahal_dist = []
        for i, row in numeric_df.iterrows():
            diff = row.values - mean
            d = np.sqrt(np.dot(np.dot(diff, cov_inv), diff))
            mahal_dist.append(d)
        
        result_df = ${varName}.loc[numeric_df.index].copy()
        result_df['Mahalanobis'] = mahal_dist
        
        # Chi-squared threshold for p=0.001
        threshold = np.sqrt(stats.chi2.ppf(0.999, df=len(numeric_df.columns)))
        result_df['Is_Outlier'] = result_df['Mahalanobis'] > threshold
        
        n_outliers = result_df['Is_Outlier'].sum()
        print(f"Threshold (p<0.001): {threshold:.4f}")
        print(f"Outliers detected: {n_outliers} ({n_outliers/len(result_df)*100:.2f}%)")
        
        print("\\n=== TOP 10 HIGHEST MAHALANOBIS DISTANCES ===")
        print(result_df.nlargest(10, 'Mahalanobis').to_string())
    except np.linalg.LinAlgError:
        print("Error: Covariance matrix is singular. Try removing collinear features.")
else:
    print("Need at least 2 numeric columns and more rows than columns")
`;
                break;
            
            case 'outliers_elliptic':
                code = `
from sklearn.covariance import EllipticEnvelope
numeric_df = ${varName}.select_dtypes(include='number').dropna()
if len(numeric_df.columns) > 0 and len(numeric_df) > 10:
    print("=== ELLIPTIC ENVELOPE ANOMALY DETECTION ===\\n")
    print("Fits a robust covariance estimate (assumes Gaussian)\\n")
    
    try:
        ee = EllipticEnvelope(contamination=0.05, random_state=42)
        predictions = ee.fit_predict(numeric_df)
        scores = ee.decision_function(numeric_df)
        
        n_outliers = (predictions == -1).sum()
        print(f"Outliers detected: {n_outliers} ({n_outliers/len(predictions)*100:.2f}%)")
        
        result_df = ${varName}.loc[numeric_df.index].copy()
        result_df['EE_Score'] = scores
        result_df['Is_Outlier'] = predictions == -1
        
        print("\\n=== TOP 10 MOST ANOMALOUS ROWS ===")
        print(result_df.nsmallest(10, 'EE_Score').to_string())
    except Exception as e:
        print(f"Error: {e}")
        print("The data may not be suitable for Elliptic Envelope")
else:
    print("Need numeric columns with at least 10 rows")
`;
                break;
            
            case 'duplicates':
                code = `
print("=== DUPLICATE ANALYSIS ===\\n")

# Full row duplicates
full_dupes = ${varName}.duplicated()
n_full_dupes = full_dupes.sum()
print(f"Exact duplicate rows: {n_full_dupes} ({n_full_dupes/len(${varName})*100:.2f}%)")

if n_full_dupes > 0:
    print("\\n=== SAMPLE DUPLICATE ROWS ===")
    dupe_rows = ${varName}[full_dupes]
    print(dupe_rows.head(10).to_string())

# Check for near-duplicates by column
print("\\n=== DUPLICATES BY COLUMN ===")
for col in ${varName}.columns[:10]:
    col_dupes = ${varName}[col].duplicated().sum()
    if col_dupes > 0:
        print(f"{col}: {col_dupes} duplicates ({col_dupes/len(${varName})*100:.1f}%)")
`;
                break;
            
            case 'outliers_mad':
                code = `
import numpy as np
numeric_df = ${varName}.select_dtypes(include='number')
if len(numeric_df.columns) > 0:
    print("=== MAD (MEDIAN ABSOLUTE DEVIATION) OUTLIER DETECTION ===\\n")
    print("MAD is robust to outliers unlike standard deviation\\n")
    
    results = []
    for col in numeric_df.columns:
        data = numeric_df[col].dropna()
        median = data.median()
        mad = np.median(np.abs(data - median))
        
        # Modified Z-score using MAD
        if mad > 0:
            modified_z = 0.6745 * (data - median) / mad
            outliers = (np.abs(modified_z) > 3.5).sum()
        else:
            outliers = 0
        
        results.append({
            'Column': col,
            'Median': median,
            'MAD': mad,
            'Outliers': outliers,
            'Outlier_%': round(outliers / len(data) * 100, 2)
        })
    
    result_df = pd.DataFrame(results).set_index('Column')
    print(result_df.round(4).to_string())
    print(f"\\nTotal outliers: {result_df['Outliers'].sum()}")
else:
    print("No numeric columns found")
`;
                break;
            
            case 'outliers_modified_zscore':
                code = `
import numpy as np
numeric_df = ${varName}.select_dtypes(include='number')
if len(numeric_df.columns) > 0:
    print("=== MODIFIED Z-SCORE ANALYSIS ===\\n")
    print("Modified Z-Score uses median and MAD (more robust than standard Z-score)")
    print("Threshold: |Modified Z| > 3.5 indicates outliers\\n")
    
    results = []
    for col in numeric_df.columns:
        data = numeric_df[col].dropna()
        median = data.median()
        mad = np.median(np.abs(data - median))
        
        if mad > 0:
            modified_z = 0.6745 * (data - median) / mad
            max_z = np.abs(modified_z).max()
            outliers_count = (np.abs(modified_z) > 3.5).sum()
        else:
            max_z = 0
            outliers_count = 0
        
        results.append({
            'Column': col,
            'Median': median,
            'MAD': mad,
            'Max_ModZ': max_z,
            'Outliers': outliers_count
        })
    
    result_df = pd.DataFrame(results).set_index('Column')
    print(result_df.round(4).to_string())
else:
    print("No numeric columns found")
`;
                break;
            
            case 'outliers_percentile':
                code = `
numeric_df = ${varName}.select_dtypes(include='number')
if len(numeric_df.columns) > 0:
    print("=== PERCENTILE-BASED OUTLIER DETECTION (1% - 99%) ===\\n")
    
    results = []
    for col in numeric_df.columns:
        data = numeric_df[col].dropna()
        p1 = data.quantile(0.01)
        p99 = data.quantile(0.99)
        
        below_1pct = (data < p1).sum()
        above_99pct = (data > p99).sum()
        
        results.append({
            'Column': col,
            'P1': p1,
            'P99': p99,
            'Below_1%': below_1pct,
            'Above_99%': above_99pct,
            'Total': below_1pct + above_99pct
        })
    
    result_df = pd.DataFrame(results).set_index('Column')
    print(result_df.round(4).to_string())
    
    print("\\n=== EXTREME VALUES ===")
    for col in numeric_df.columns:
        data = numeric_df[col]
        p1, p99 = data.quantile([0.01, 0.99])
        extremes = data[(data < p1) | (data > p99)]
        if len(extremes) > 0:
            print(f"\\n{col}: {extremes.head(5).tolist()}")
else:
    print("No numeric columns found")
`;
                break;
            
            case 'skewness':
                code = `
numeric_df = ${varName}.select_dtypes(include='number')
if len(numeric_df.columns) > 0:
    print("=== SKEWNESS ANALYSIS ===\\n")
    print("Interpretation:")
    print("  • |skew| < 0.5 : Fairly symmetric")
    print("  • 0.5 ≤ |skew| < 1 : Moderately skewed")
    print("  • |skew| ≥ 1 : Highly skewed\\n")
    
    skewness = numeric_df.skew()
    
    skew_df = pd.DataFrame({
        'Skewness': skewness,
        'Direction': ['Left' if s < 0 else 'Right' if s > 0 else 'None' for s in skewness],
        'Severity': ['Symmetric' if abs(s) < 0.5 else 'Moderate' if abs(s) < 1 else 'HIGH' for s in skewness]
    })
    print(skew_df.round(4).to_string())
    
    highly_skewed = skew_df[skew_df['Severity'] == 'HIGH'].index.tolist()
    if highly_skewed:
        print(f"\\n⚠️ Highly skewed columns: {', '.join(highly_skewed)}")
        print("Consider log/sqrt transformation for these columns")
else:
    print("No numeric columns found")
`;
                break;
            
            case 'kurtosis':
                code = `
numeric_df = ${varName}.select_dtypes(include='number')
if len(numeric_df.columns) > 0:
    print("=== KURTOSIS ANALYSIS ===\\n")
    print("Interpretation (excess kurtosis):")
    print("  • < 0 : Platykurtic (light tails, flatter than normal)")
    print("  • = 0 : Mesokurtic (normal distribution)")
    print("  • > 0 : Leptokurtic (heavy tails, more outliers)\\n")
    
    kurtosis = numeric_df.kurtosis()
    
    kurt_df = pd.DataFrame({
        'Kurtosis': kurtosis,
        'Type': ['Platykurtic' if k < -1 else 'Normal-like' if abs(k) <= 1 else 'Leptokurtic' for k in kurtosis],
        'Outlier_Risk': ['Low' if k < 0 else 'Normal' if k < 3 else 'HIGH' for k in kurtosis]
    })
    print(kurt_df.round(4).to_string())
    
    high_kurt = kurt_df[kurt_df['Outlier_Risk'] == 'HIGH'].index.tolist()
    if high_kurt:
        print(f"\\n⚠️ High kurtosis columns (expect many outliers): {', '.join(high_kurt)}")
else:
    print("No numeric columns found")
`;
                break;
            
            case 'normality':
                code = `
from scipy import stats
numeric_df = ${varName}.select_dtypes(include='number')
if len(numeric_df.columns) > 0:
    print("=== NORMALITY TESTS ===\\n")
    print("Shapiro-Wilk Test (H0: data is normally distributed)")
    print("p-value < 0.05 → Reject H0 → NOT normal\\n")
    
    results = []
    for col in numeric_df.columns:
        data = numeric_df[col].dropna()
        if len(data) >= 3 and len(data) <= 5000:
            stat, p_value = stats.shapiro(data)
            is_normal = p_value > 0.05
        elif len(data) > 5000:
            # Use D'Agostino-Pearson for large samples
            stat, p_value = stats.normaltest(data)
            is_normal = p_value > 0.05
        else:
            stat, p_value = None, None
            is_normal = None
        
        results.append({
            'Column': col,
            'Statistic': stat,
            'P_Value': p_value,
            'Is_Normal': '✓' if is_normal else '✗' if is_normal is not None else 'N/A'
        })
    
    result_df = pd.DataFrame(results).set_index('Column')
    print(result_df.to_string())
    
    non_normal = [r['Column'] for r in results if r['Is_Normal'] == '✗']
    if non_normal:
        print(f"\\n⚠️ Non-normal distributions: {', '.join(non_normal[:10])}")
else:
    print("No numeric columns found")
`;
                break;
            
            case 'describe_full':
                code = `
numeric_df = ${varName}.select_dtypes(include='number')
if len(numeric_df.columns) > 0:
    print("=== EXTENDED STATISTICAL SUMMARY ===\\n")
    
    stats_df = pd.DataFrame({
        'Count': numeric_df.count(),
        'Mean': numeric_df.mean(),
        'Std': numeric_df.std(),
        'Min': numeric_df.min(),
        'P1': numeric_df.quantile(0.01),
        'P5': numeric_df.quantile(0.05),
        'P25': numeric_df.quantile(0.25),
        'P50': numeric_df.quantile(0.50),
        'P75': numeric_df.quantile(0.75),
        'P95': numeric_df.quantile(0.95),
        'P99': numeric_df.quantile(0.99),
        'Max': numeric_df.max(),
        'Skew': numeric_df.skew(),
        'Kurt': numeric_df.kurtosis()
    })
    print(stats_df.round(4).T.to_string())
else:
    print("No numeric columns found")
`;
                break;
            
            case 'distribution':
                code = `
import numpy as np
numeric_df = ${varName}.select_dtypes(include='number')
if len(numeric_df.columns) > 0:
    print("=== DISTRIBUTION ANALYSIS (10 bins) ===\\n")
    
    for col in numeric_df.columns[:5]:  # Limit to first 5 columns
        data = numeric_df[col].dropna()
        print(f"\\n--- {col} ---")
        counts, bins = np.histogram(data, bins=10)
        total = len(data)
        
        for i in range(len(counts)):
            pct = counts[i] / total * 100
            bar = '█' * int(pct / 2)
            print(f"[{bins[i]:8.2f} - {bins[i+1]:8.2f}]: {counts[i]:5d} ({pct:5.1f}%) {bar}")
    
    if len(numeric_df.columns) > 5:
        print(f"\\n... and {len(numeric_df.columns) - 5} more columns")
else:
    print("No numeric columns found")
`;
                break;
            
            case 'zscore_table':
                code = `
import numpy as np
from scipy import stats
numeric_df = ${varName}.select_dtypes(include='number')
if len(numeric_df.columns) > 0:
    print("=== FULL Z-SCORE TABLE ===\\n")
    
    z_scores = pd.DataFrame(
        stats.zscore(numeric_df, nan_policy='omit'),
        columns=numeric_df.columns,
        index=numeric_df.index
    ).round(3)
    
    # Show rows with any extreme z-scores
    extreme_mask = (np.abs(z_scores) > 2).any(axis=1)
    extreme_rows = z_scores[extreme_mask]
    
    if len(extreme_rows) > 0:
        print(f"Rows with |Z| > 2: {len(extreme_rows)}\\n")
        print(extreme_rows.head(20).to_string())
        
        if len(extreme_rows) > 20:
            print(f"\\n... showing 20 of {len(extreme_rows)} rows with extreme values")
    else:
        print("No rows with |Z| > 2 found")
        print("\\nSample of Z-scores:")
        print(z_scores.head(10).to_string())
else:
    print("No numeric columns found")
`;
                break;
            
            case 'missing_analysis':
                code = `
print("=== MISSING DATA ANALYSIS ===\\n")
missing = ${varName}.isnull().sum()
missing_pct = (missing / len(${varName}) * 100).round(2)
missing_df = pd.DataFrame({
    'Missing_Count': missing,
    'Missing_%': missing_pct,
    'Dtype': ${varName}.dtypes
})
missing_df = missing_df[missing_df['Missing_Count'] > 0].sort_values('Missing_%', ascending=False)

if len(missing_df) > 0:
    print(missing_df.to_string())
    print(f"\\nTotal cells with missing data: {missing.sum()} ({missing.sum()/(len(${varName})*len(${varName}.columns))*100:.2f}%)")
    
    # Missing patterns
    print("\\n=== MISSING PATTERNS (top 10 row patterns) ===")
    pattern = ${varName}.isnull().apply(lambda x: ''.join(['1' if v else '0' for v in x]), axis=1)
    print(pattern.value_counts().head(10).to_string())
else:
    print("No missing values found! 🎉")
`;
                break;
            
            case 'correlation_strong':
                code = `
numeric_df = ${varName}.select_dtypes(include='number')
if len(numeric_df.columns) > 1:
    print("=== STRONG CORRELATIONS (|r| > 0.7) ===\\n")
    corr = numeric_df.corr()
    
    # Get pairs with strong correlation
    strong_pairs = []
    for i in range(len(corr.columns)):
        for j in range(i+1, len(corr.columns)):
            r = corr.iloc[i, j]
            if abs(r) > 0.7:
                strong_pairs.append({
                    'Variable_1': corr.columns[i],
                    'Variable_2': corr.columns[j],
                    'Correlation': round(r, 4),
                    'Strength': 'Very Strong' if abs(r) > 0.9 else 'Strong'
                })
    
    if strong_pairs:
        pairs_df = pd.DataFrame(strong_pairs).sort_values('Correlation', key=abs, ascending=False)
        print(pairs_df.to_string(index=False))
    else:
        print("No strong correlations found (all |r| < 0.7)")
    
    print("\\n=== CORRELATION MATRIX ===")
    print(corr.round(3).to_string())
else:
    print("Need at least 2 numeric columns for correlation")
`;
                break;
            
            case 'value_distribution':
                if (column) {
                    code = `
col_data = ${varName}['${column}']
print(f"=== VALUE DISTRIBUTION: ${column} ===\\n")
print(f"Count: {len(col_data)}")
print(f"Unique: {col_data.nunique()}")
print(f"Missing: {col_data.isnull().sum()} ({col_data.isnull().sum()/len(col_data)*100:.2f}%)")

if pd.api.types.is_numeric_dtype(col_data):
    print(f"\\nMean: {col_data.mean():.4f}")
    print(f"Median: {col_data.median():.4f}")
    print(f"Std: {col_data.std():.4f}")
    print(f"Min: {col_data.min()}")
    print(f"Max: {col_data.max()}")
    print(f"Skewness: {col_data.skew():.4f}")
    print(f"Kurtosis: {col_data.kurtosis():.4f}")
    
    # Outlier bounds
    Q1, Q3 = col_data.quantile([0.25, 0.75])
    IQR = Q3 - Q1
    lower, upper = Q1 - 1.5*IQR, Q3 + 1.5*IQR
    outliers = col_data[(col_data < lower) | (col_data > upper)]
    print(f"\\nIQR Outliers: {len(outliers)} ({len(outliers)/len(col_data)*100:.2f}%)")
    print(f"Bounds: [{lower:.4f}, {upper:.4f}]")
else:
    print("\\n=== TOP 20 VALUES ===")
    print(col_data.value_counts().head(20).to_string())
`;
                }
                break;
        }
        
        if (!code) return;
        
        // Show the command being executed
        const displayCode = code.replace(/\\n/g, '\n').trim();
        this.appendToConsole(displayCode, false, true); // isCommand = true
        
        const result = await this.options.executePython(code, false);
        
        if (result.error) {
            this.appendToConsole(`${result.error}`, true);
        } else if (result.text) {
            // Detect if output looks like a table (describe, corr, value_counts, info)
            const tableTools = ['describe', 'corr', 'info', 'value_counts', 'unique'];
            const isTable = tableTools.includes(tool) || result.text.includes('  ') || result.text.includes('\n');
            this.appendToConsole(result.text, false, false, isTable);
        } else {
            this.appendToConsole('✅ Operation completed successfully');
        }
        
        // Refresh data if modified
        const modifyingTools = [
            'dropna', 'drop_duplicates', 'reset_index',
            'fillna_0', 'fillna_mean', 'fillna_median', 'fillna_mode', 'fillna_ffill', 'fillna_bfill'
        ];
        if (modifyingTools.includes(tool)) {
            await this.refreshData();
        }
    }
    
    private showFillNAOptions(e: MouseEvent) {
        const menu = document.createElement('div');
        menu.className = 'df-dropdown-menu';
        
        const opt0 = menu.createEl('button', { text: '🔢 Fill with 0', cls: 'df-dropdown-item' });
        opt0.onclick = () => {
            menu.remove();
            this.runDSTool('fillna_0');
        };
        
        const optMean = menu.createEl('button', { text: '📊 Fill with Mean', cls: 'df-dropdown-item' });
        optMean.onclick = () => {
            menu.remove();
            this.runDSTool('fillna_mean');
        };
        
        const optMedian = menu.createEl('button', { text: '📈 Fill with Median', cls: 'df-dropdown-item' });
        optMedian.onclick = () => {
            menu.remove();
            this.runDSTool('fillna_median');
        };
        
        const optMode = menu.createEl('button', { text: '🎯 Fill with Mode', cls: 'df-dropdown-item' });
        optMode.onclick = () => {
            menu.remove();
            this.runDSTool('fillna_mode');
        };
        
        const optForward = menu.createEl('button', { text: '➡️ Forward Fill (ffill)', cls: 'df-dropdown-item' });
        optForward.onclick = () => {
            menu.remove();
            this.runDSTool('fillna_ffill');
        };
        
        const optBackward = menu.createEl('button', { text: '⬅️ Backward Fill (bfill)', cls: 'df-dropdown-item' });
        optBackward.onclick = () => {
            menu.remove();
            this.runDSTool('fillna_bfill');
        };
        
        // Position and show menu
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        this.positionDropdownMenu(menu, rect);
        document.body.appendChild(menu);
        
        // Close on click outside
        const closeMenu = (ev: MouseEvent) => {
            if (!menu.contains(ev.target as Node)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
    
    private showOutlierOptions(e: MouseEvent) {
        const menu = document.createElement('div');
        menu.className = 'df-dropdown-menu';
        
        const optIQR = menu.createEl('button', { text: '📦 IQR Method (1.5×IQR)', cls: 'df-dropdown-item' });
        optIQR.onclick = () => {
            menu.remove();
            this.runDSTool('outliers_iqr');
        };
        
        const optZScore = menu.createEl('button', { text: '📐 Z-Score Method (|z|>3)', cls: 'df-dropdown-item' });
        optZScore.onclick = () => {
            menu.remove();
            this.runDSTool('outliers_zscore');
        };
        
        const optMAD = menu.createEl('button', { text: '📊 MAD Method (Robust)', cls: 'df-dropdown-item' });
        optMAD.onclick = () => {
            menu.remove();
            this.runDSTool('outliers_mad');
        };
        
        const optModZ = menu.createEl('button', { text: '🎯 Modified Z-Score', cls: 'df-dropdown-item' });
        optModZ.onclick = () => {
            menu.remove();
            this.runDSTool('outliers_modified_zscore');
        };
        
        const optPercentile = menu.createEl('button', { text: '📈 Percentile Method (1%-99%)', cls: 'df-dropdown-item' });
        optPercentile.onclick = () => {
            menu.remove();
            this.runDSTool('outliers_percentile');
        };
        
        // Separator
        menu.createEl('div', { cls: 'df-dropdown-separator' });
        
        const optZTable = menu.createEl('button', { text: '🧮 Full Z-Score Table', cls: 'df-dropdown-item' });
        optZTable.onclick = () => {
            menu.remove();
            this.runDSTool('zscore_table');
        };
        
        const optQuantiles = menu.createEl('button', { text: '📊 Quantile Analysis', cls: 'df-dropdown-item' });
        optQuantiles.onclick = () => {
            menu.remove();
            this.runDSTool('quantiles');
        };
        
        // Position and show menu
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        this.positionDropdownMenu(menu, rect);
        document.body.appendChild(menu);
        
        // Close on click outside
        const closeMenu = (ev: MouseEvent) => {
            if (!menu.contains(ev.target as Node)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
    
    private showDistributionOptions(e: MouseEvent) {
        const menu = document.createElement('div');
        menu.className = 'df-dropdown-menu';
        
        const optSkew = menu.createEl('button', { text: '📊 Skewness Analysis', cls: 'df-dropdown-item' });
        optSkew.onclick = () => { menu.remove(); this.runDSTool('skewness'); };
        
        const optKurt = menu.createEl('button', { text: '📈 Kurtosis Analysis', cls: 'df-dropdown-item' });
        optKurt.onclick = () => { menu.remove(); this.runDSTool('kurtosis'); };
        
        const optNorm = menu.createEl('button', { text: '🔔 Normality Test', cls: 'df-dropdown-item' });
        optNorm.onclick = () => { menu.remove(); this.runDSTool('normality'); };
        
        const optDist = menu.createEl('button', { text: '📉 Distribution Histogram', cls: 'df-dropdown-item' });
        optDist.onclick = () => { menu.remove(); this.runDSTool('distribution'); };
        
        menu.createEl('div', { cls: 'df-dropdown-separator' });
        
        const optSkewKurt = menu.createEl('button', { text: '📐 Skew + Kurtosis Combined', cls: 'df-dropdown-item' });
        optSkewKurt.onclick = () => { menu.remove(); this.runDSTool('skew_kurt'); };
        
        // Position and show menu
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        this.positionDropdownMenu(menu, rect);
        document.body.appendChild(menu);
        
        const closeMenu = (ev: MouseEvent) => {
            if (!menu.contains(ev.target as Node)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
    
    private showMLAnomalyOptions(e: MouseEvent) {
        const menu = document.createElement('div');
        menu.className = 'df-dropdown-menu';
        
        const optIsoForest = menu.createEl('button', { text: '🌲 Isolation Forest', cls: 'df-dropdown-item' });
        optIsoForest.onclick = () => { menu.remove(); this.runDSTool('outliers_isolation_forest'); };
        
        const optLOF = menu.createEl('button', { text: '🎯 Local Outlier Factor (LOF)', cls: 'df-dropdown-item' });
        optLOF.onclick = () => { menu.remove(); this.runDSTool('outliers_lof'); };
        
        const optDBSCAN = menu.createEl('button', { text: '🔵 DBSCAN Clustering', cls: 'df-dropdown-item' });
        optDBSCAN.onclick = () => { menu.remove(); this.runDSTool('outliers_dbscan'); };
        
        menu.createEl('div', { cls: 'df-dropdown-separator' });
        
        const optMultivariate = menu.createEl('button', { text: '🧮 Mahalanobis Distance', cls: 'df-dropdown-item' });
        optMultivariate.onclick = () => { menu.remove(); this.runDSTool('outliers_mahalanobis'); };
        
        const optElliptic = menu.createEl('button', { text: '⭕ Elliptic Envelope', cls: 'df-dropdown-item' });
        optElliptic.onclick = () => { menu.remove(); this.runDSTool('outliers_elliptic'); };
        
        // Position and show menu
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        this.positionDropdownMenu(menu, rect);
        document.body.appendChild(menu);
        
        const closeMenu = (ev: MouseEvent) => {
            if (!menu.contains(ev.target as Node)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
    
    private showAnalyzeOptions(e: MouseEvent) {
        const menu = document.createElement('div');
        menu.className = 'df-dropdown-menu';
        
        const optDescribe = menu.createEl('button', { text: '📊 Describe', cls: 'df-dropdown-item' });
        optDescribe.onclick = () => { menu.remove(); this.runDSTool('describe'); };
        
        const optDescribeFull = menu.createEl('button', { text: '📈 Extended Describe', cls: 'df-dropdown-item' });
        optDescribeFull.onclick = () => { menu.remove(); this.runDSTool('describe_full'); };
        
        const optInfo = menu.createEl('button', { text: 'ℹ️ Info', cls: 'df-dropdown-item' });
        optInfo.onclick = () => { menu.remove(); this.runDSTool('info'); };
        
        menu.createEl('div', { cls: 'df-dropdown-separator' });
        
        const optCorr = menu.createEl('button', { text: '🔗 Correlation Matrix', cls: 'df-dropdown-item' });
        optCorr.onclick = () => { menu.remove(); this.runDSTool('corr'); };
        
        const optCorrStrong = menu.createEl('button', { text: '💪 Strong Correlations', cls: 'df-dropdown-item' });
        optCorrStrong.onclick = () => { menu.remove(); this.runDSTool('correlation_strong'); };
        
        menu.createEl('div', { cls: 'df-dropdown-separator' });
        
        const optQuantiles = menu.createEl('button', { text: '📐 Quantile Analysis', cls: 'df-dropdown-item' });
        optQuantiles.onclick = () => { menu.remove(); this.runDSTool('quantiles'); };
        
        const optMissing = menu.createEl('button', { text: '❓ Missing Data', cls: 'df-dropdown-item' });
        optMissing.onclick = () => { menu.remove(); this.runDSTool('missing_analysis'); };
        
        const optDupes = menu.createEl('button', { text: '👯 Duplicates', cls: 'df-dropdown-item' });
        optDupes.onclick = () => { menu.remove(); this.runDSTool('duplicates'); };
        
        // Position and show menu
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        this.positionDropdownMenu(menu, rect);
        document.body.appendChild(menu);
        
        const closeMenu = (ev: MouseEvent) => {
            if (!menu.contains(ev.target as Node)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
    
    private showAnomalyOptions(e: MouseEvent) {
        const menu = document.createElement('div');
        menu.className = 'df-dropdown-menu';
        
        // Outlier section
        menu.createEl('div', { text: '📦 Outlier Detection', cls: 'df-dropdown-header' });
        
        const optIQR = menu.createEl('button', { text: 'IQR Method (1.5×IQR)', cls: 'df-dropdown-item' });
        optIQR.onclick = () => { menu.remove(); this.runDSTool('outliers_iqr'); };
        
        const optZScore = menu.createEl('button', { text: 'Z-Score (|z|>3)', cls: 'df-dropdown-item' });
        optZScore.onclick = () => { menu.remove(); this.runDSTool('outliers_zscore'); };
        
        const optMAD = menu.createEl('button', { text: 'MAD (Robust)', cls: 'df-dropdown-item' });
        optMAD.onclick = () => { menu.remove(); this.runDSTool('outliers_mad'); };
        
        const optPercentile = menu.createEl('button', { text: 'Percentile (1%-99%)', cls: 'df-dropdown-item' });
        optPercentile.onclick = () => { menu.remove(); this.runDSTool('outliers_percentile'); };
        
        menu.createEl('div', { cls: 'df-dropdown-separator' });
        
        // Distribution section
        menu.createEl('div', { text: '📊 Distribution', cls: 'df-dropdown-header' });
        
        const optSkew = menu.createEl('button', { text: 'Skewness', cls: 'df-dropdown-item' });
        optSkew.onclick = () => { menu.remove(); this.runDSTool('skewness'); };
        
        const optKurt = menu.createEl('button', { text: 'Kurtosis', cls: 'df-dropdown-item' });
        optKurt.onclick = () => { menu.remove(); this.runDSTool('kurtosis'); };
        
        const optNormal = menu.createEl('button', { text: 'Normality Test', cls: 'df-dropdown-item' });
        optNormal.onclick = () => { menu.remove(); this.runDSTool('normality'); };
        
        const optDist = menu.createEl('button', { text: 'Distribution Histogram', cls: 'df-dropdown-item' });
        optDist.onclick = () => { menu.remove(); this.runDSTool('distribution'); };
        
        menu.createEl('div', { cls: 'df-dropdown-separator' });
        
        // ML section
        menu.createEl('div', { text: '🤖 ML Detection', cls: 'df-dropdown-header' });
        
        const optIsoForest = menu.createEl('button', { text: 'Isolation Forest', cls: 'df-dropdown-item' });
        optIsoForest.onclick = () => { menu.remove(); this.runDSTool('outliers_isolation_forest'); };
        
        const optLOF = menu.createEl('button', { text: 'Local Outlier Factor', cls: 'df-dropdown-item' });
        optLOF.onclick = () => { menu.remove(); this.runDSTool('outliers_lof'); };
        
        const optDBSCAN = menu.createEl('button', { text: 'DBSCAN Clustering', cls: 'df-dropdown-item' });
        optDBSCAN.onclick = () => { menu.remove(); this.runDSTool('outliers_dbscan'); };
        
        const optMahal = menu.createEl('button', { text: 'Mahalanobis Distance', cls: 'df-dropdown-item' });
        optMahal.onclick = () => { menu.remove(); this.runDSTool('outliers_mahalanobis'); };
        
        const optElliptic = menu.createEl('button', { text: 'Elliptic Envelope', cls: 'df-dropdown-item' });
        optElliptic.onclick = () => { menu.remove(); this.runDSTool('outliers_elliptic'); };
        
        // Position and show menu
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        this.positionDropdownMenu(menu, rect);
        document.body.appendChild(menu);
        
        const closeMenu = (ev: MouseEvent) => {
            if (!menu.contains(ev.target as Node)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
    
    private showStatsOptions(e: MouseEvent) {
        const menu = document.createElement('div');
        menu.className = 'df-dropdown-menu';
        
        const optDescribe = menu.createEl('button', { text: '📊 Extended Describe', cls: 'df-dropdown-item' });
        optDescribe.onclick = () => { menu.remove(); this.runDSTool('describe_full'); };
        
        const optQuantiles = menu.createEl('button', { text: '📈 Quantile Analysis', cls: 'df-dropdown-item' });
        optQuantiles.onclick = () => { menu.remove(); this.runDSTool('quantiles'); };
        
        const optZScore = menu.createEl('button', { text: '🧮 Z-Score Table', cls: 'df-dropdown-item' });
        optZScore.onclick = () => { menu.remove(); this.runDSTool('zscore_table'); };
        
        menu.createEl('div', { cls: 'df-dropdown-separator' });
        
        const optCorr = menu.createEl('button', { text: '🔗 Strong Correlations', cls: 'df-dropdown-item' });
        optCorr.onclick = () => { menu.remove(); this.runDSTool('correlation_strong'); };
        
        const optMissing = menu.createEl('button', { text: '❓ Missing Data Analysis', cls: 'df-dropdown-item' });
        optMissing.onclick = () => { menu.remove(); this.runDSTool('missing_analysis'); };
        
        const optDupes = menu.createEl('button', { text: '👯 Duplicate Detection', cls: 'df-dropdown-item' });
        optDupes.onclick = () => { menu.remove(); this.runDSTool('duplicates'); };
        
        // Position and show menu
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        this.positionDropdownMenu(menu, rect);
        document.body.appendChild(menu);
        
        const closeMenu = (ev: MouseEvent) => {
            if (!menu.contains(ev.target as Node)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
    
    private async refreshData() {
        const varName = this.options.variableName;
        const code = `
import json
def __df_to_json(df):
    return json.dumps({
        "columns": df.columns.tolist(),
        "data": df.values.tolist(),
        "dtypes": {c: str(df[c].dtype) for c in df.columns},
        "shape": list(df.shape),
        "memory_usage": int(df.memory_usage(deep=True).sum()),
        "null_counts": df.isnull().sum().to_dict()
    }, default=str)
print(__df_to_json(${varName}))
`;
        
        const result = await this.options.executePython(code, false);
        
        if (result.text && !result.error) {
            try {
                const newData = JSON.parse(result.text);
                this.data = newData;
                this.renderModal(false);
            } catch (e) {
                console.error('Failed to parse refreshed DataFrame:', e);
            }
        }
    }
    
    private appendToConsole(text: string, isError = false, isCommand = false, isTable = false) {
        if (!this.consoleOutput) return;
        
        // Smart learning: extract columns and variables from outputs
        if (!isCommand && !isError) {
            this.extractColumnsFromOutput(text);
        }
        
        // Track recent commands for smart suggestions
        if (isCommand) {
            const methodMatch = text.match(/\.(\w+)\s*\(/);
            if (methodMatch) {
                const method = methodMatch[1] + '()';
                // Add to recent operations (keep last 10)
                this.recentOperations = [method, ...this.recentOperations.filter(m => m !== method)].slice(0, 10);
            }
        }
        
        const entry = this.consoleOutput.createEl('div', { 
            cls: `df-console-entry ${isError ? 'df-console-error' : ''} ${isCommand ? 'df-console-command' : ''} ${isTable ? 'df-console-table' : ''}`
        });
        // Store original text for copy and re-render
        entry.setAttribute('data-original-text', text);
        entry.setAttribute('data-is-table', isTable.toString());
        
        const timestamp = entry.createEl('span', {
            text: `[${new Date().toLocaleTimeString()}] `,
            cls: 'df-console-time'
        });
        
        if (isCommand) {
            // Command with Python syntax highlighting
            const cmdContainer = entry.createEl('div', { cls: 'df-console-cmd-container' });
            const cmdLabel = cmdContainer.createEl('span', { text: '>>> ', cls: 'df-console-prompt' });
            const cmdCode = cmdContainer.createEl('code', { cls: 'df-console-code' });
            cmdCode.innerHTML = this.highlightPythonSyntax(text);
            
            // Copy button for command
            const btnCopy = cmdContainer.createEl('button', { cls: 'df-console-copy-btn' });
            setIcon(btnCopy, 'copy');
            btnCopy.setAttribute('title', 'Copy command');
            btnCopy.onclick = async (e) => {
                e.stopPropagation();
                await navigator.clipboard.writeText(text);
                setIcon(btnCopy, 'check');
                setTimeout(() => setIcon(btnCopy, 'copy'), 1500);
            };
        } else if (isTable) {
            // Format table output with optional heatmap
            this.renderTableOutput(entry, text);
        } else {
            entry.createSpan({ text, cls: isError ? 'df-console-error-text' : '' });
            
            // Copy button for regular output if text is long
            if (text.length > 50) {
                const btnCopy = entry.createEl('button', { cls: 'df-console-copy-btn' });
                setIcon(btnCopy, 'copy');
                btnCopy.setAttribute('title', 'Copy');
                btnCopy.onclick = async (e) => {
                    e.stopPropagation();
                    await navigator.clipboard.writeText(text);
                    setIcon(btnCopy, 'check');
                    setTimeout(() => setIcon(btnCopy, 'copy'), 1500);
                };
            }
        }
        
        this.consoleOutput.scrollTop = this.consoleOutput.scrollHeight;
    }
    
    private renderTableOutput(entry: HTMLElement, text: string) {
        const outputId = this.outputCounter++;
        
        // Initialize settings for this output
        if (!this.outputHeatmapSettings.has(outputId)) {
            this.outputHeatmapSettings.set(outputId, { 
                transposed: false, 
                excludeHeader: true,
                excludedRows: new Set(),
                excludedCols: new Set(),
                excludedCells: new Set()
            });
        }
        
        const tableContainer = entry.createEl('div', { cls: 'df-console-table-container' });
        tableContainer.setAttribute('data-output-id', String(outputId));
        
        // Render the table content
        const renderContent = () => {
            const pre = tableContainer.querySelector('pre');
            if (pre) pre.remove();
            
            if (this.heatmapEnabled) {
                const settings = this.outputHeatmapSettings.get(outputId)!;
                const colorizedHtml = this.colorizeTableOutput(text, settings);
                const newPre = tableContainer.createEl('pre', { cls: 'df-console-pre df-heatmap-enabled df-heatmap-interactive' });
                newPre.innerHTML = colorizedHtml;
                
                // Add click handlers for cells to toggle exclusion
                this.setupHeatmapInteraction(newPre, outputId, text, renderContent);
                
                // Move pre before buttons
                const btns = tableContainer.querySelector('.df-console-copy-btns');
                if (btns) tableContainer.insertBefore(newPre, btns);
            } else {
                const newPre = tableContainer.createEl('pre', { cls: 'df-console-pre' });
                newPre.createEl('code', { text: text, cls: 'df-console-table-output' });
                const btns = tableContainer.querySelector('.df-console-copy-btns');
                if (btns) tableContainer.insertBefore(newPre, btns);
            }
        };
        
        // Initial render
        if (this.heatmapEnabled) {
            const settings = this.outputHeatmapSettings.get(outputId)!;
            const colorizedHtml = this.colorizeTableOutput(text, settings);
            const pre = tableContainer.createEl('pre', { cls: 'df-console-pre df-heatmap-enabled df-heatmap-interactive' });
            pre.innerHTML = colorizedHtml;
            this.setupHeatmapInteraction(pre, outputId, text, renderContent);
        } else {
            const pre = tableContainer.createEl('pre', { cls: 'df-console-pre' });
            pre.createEl('code', { text: text, cls: 'df-console-table-output' });
        }
        
        // Buttons container
        const copyBtns = tableContainer.createEl('div', { cls: 'df-console-copy-btns' });
        
        // Heatmap control buttons (only visible when heatmap is enabled)
        if (this.heatmapEnabled) {
            const settings = this.outputHeatmapSettings.get(outputId)!;
            
            // Transpose button (switch between column-wise and row-wise)
            const btnTranspose = copyBtns.createEl('button', { 
                cls: `df-console-copy-btn df-heatmap-ctrl ${settings.transposed ? 'active' : ''}` 
            });
            setIcon(btnTranspose, 'arrow-left-right');
            btnTranspose.createSpan({ text: settings.transposed ? ' By Row' : ' By Col', cls: 'df-btn-text-mini' });
            btnTranspose.setAttribute('title', settings.transposed ? 
                'Stats per ROW (click for per Column)' : 
                'Stats per COLUMN (click for per Row)');
            btnTranspose.onclick = (e) => {
                e.stopPropagation();
                settings.transposed = !settings.transposed;
                btnTranspose.classList.toggle('active', settings.transposed);
                const textSpan = btnTranspose.querySelector('.df-btn-text-mini');
                if (textSpan) textSpan.textContent = settings.transposed ? ' By Row' : ' By Col';
                btnTranspose.setAttribute('title', settings.transposed ? 
                    'Stats per ROW (click for per Column)' : 
                    'Stats per COLUMN (click for per Row)');
                renderContent();
            };
            
            // Exclude header button
            const btnExcludeHeader = copyBtns.createEl('button', { 
                cls: `df-console-copy-btn df-heatmap-ctrl ${settings.excludeHeader ? 'active' : ''}` 
            });
            const headerIconSpan = btnExcludeHeader.createSpan({ cls: 'df-btn-icon-wrap' });
            setIcon(headerIconSpan, settings.excludeHeader ? 'eye-off' : 'eye');
            btnExcludeHeader.createSpan({ text: ' Header', cls: 'df-btn-text-mini' });
            btnExcludeHeader.setAttribute('title', settings.excludeHeader ? 
                'Header/Index EXCLUDED from stats (click to include)' : 
                'Header/Index INCLUDED in stats (click to exclude)');
            btnExcludeHeader.onclick = (e) => {
                e.stopPropagation();
                settings.excludeHeader = !settings.excludeHeader;
                btnExcludeHeader.classList.toggle('active', settings.excludeHeader);
                setIcon(headerIconSpan, settings.excludeHeader ? 'eye-off' : 'eye');
                btnExcludeHeader.setAttribute('title', settings.excludeHeader ? 
                    'Header/Index EXCLUDED from stats (click to include)' : 
                    'Header/Index INCLUDED in stats (click to exclude)');
                renderContent();
            };
            
            // Separator
            copyBtns.createEl('span', { cls: 'df-btn-separator' });
        }
        
        // Copy as text
        const btnCopyText = copyBtns.createEl('button', { cls: 'df-console-copy-btn' });
        setIcon(btnCopyText, 'copy');
        btnCopyText.createSpan({ text: ' Copy', cls: 'df-btn-text-mini' });
        btnCopyText.setAttribute('title', 'Copy as plain text');
        btnCopyText.onclick = async (e) => {
            e.stopPropagation();
            await navigator.clipboard.writeText(text);
            setIcon(btnCopyText, 'check');
            setTimeout(() => setIcon(btnCopyText, 'copy'), 1500);
        };
        
        // Copy as HTML (with colors)
        if (this.heatmapEnabled) {
            const btnCopyHtml = copyBtns.createEl('button', { cls: 'df-console-copy-btn df-copy-styled' });
            setIcon(btnCopyHtml, 'palette');
            btnCopyHtml.createSpan({ text: ' Styled', cls: 'df-btn-text-mini' });
            btnCopyHtml.setAttribute('title', 'Copy with heatmap colors (HTML)');
            btnCopyHtml.onclick = async (e) => {
                e.stopPropagation();
                const pre = tableContainer.querySelector('pre');
                if (pre) {
                    const htmlContent = this.generateCopyableHtml(pre.innerHTML);
                    const blob = new Blob([htmlContent], { type: 'text/html' });
                    try {
                        await navigator.clipboard.write([
                            new ClipboardItem({
                                'text/html': blob,
                                'text/plain': new Blob([text], { type: 'text/plain' })
                            })
                        ]);
                        setIcon(btnCopyHtml, 'check');
                        setTimeout(() => setIcon(btnCopyHtml, 'palette'), 1500);
                    } catch (err) {
                        // Fallback to text copy
                        await navigator.clipboard.writeText(text);
                        setIcon(btnCopyHtml, 'check');
                        setTimeout(() => setIcon(btnCopyHtml, 'palette'), 1500);
                    }
                }
            };
            
            // Copy as Image
            const btnCopyImage = copyBtns.createEl('button', { cls: 'df-console-copy-btn df-copy-image' });
            setIcon(btnCopyImage, 'image');
            btnCopyImage.createSpan({ text: ' Image', cls: 'df-btn-text-mini' });
            btnCopyImage.setAttribute('title', 'Copy heatmap as image (PNG)');
            btnCopyImage.onclick = async (e) => {
                e.stopPropagation();
                await this.copyTableAsImage(tableContainer, btnCopyImage);
            };
        }
    }
    
    // Copy table container as image
    private async copyTableAsImage(tableContainer: HTMLElement, button: HTMLElement): Promise<void> {
        try {
            // Find the pre element with the heatmap
            const pre = tableContainer.querySelector('pre') as HTMLElement;
            if (!pre) {
                new Notice('No heatmap to capture');
                return;
            }
            
            // Use html2canvas approach - create a canvas from the element
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            
            // Get computed styles and dimensions
            const rect = pre.getBoundingClientRect();
            const scale = 2; // Higher resolution
            
            canvas.width = rect.width * scale;
            canvas.height = rect.height * scale;
            ctx.scale(scale, scale);
            
            // Draw background
            const computedStyle = window.getComputedStyle(pre);
            ctx.fillStyle = computedStyle.backgroundColor || '#1e1e1e';
            ctx.fillRect(0, 0, rect.width, rect.height);
            
            // Create a foreignObject SVG to render HTML
            const data = `
                <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
                    <foreignObject width="100%" height="100%">
                        <div xmlns="http://www.w3.org/1999/xhtml" style="
                            font-family: 'Fira Code', 'JetBrains Mono', Consolas, monospace;
                            font-size: ${computedStyle.fontSize};
                            line-height: ${computedStyle.lineHeight};
                            background: ${computedStyle.backgroundColor};
                            color: ${computedStyle.color};
                            padding: ${computedStyle.padding};
                            white-space: pre;
                        ">${pre.innerHTML}</div>
                    </foreignObject>
                </svg>
            `;
            
            const img = new Image();
            const svgBlob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            
            img.onload = async () => {
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
                
                // Convert to blob and copy
                canvas.toBlob(async (blob) => {
                    if (blob) {
                        try {
                            await navigator.clipboard.write([
                                new ClipboardItem({ 'image/png': blob })
                            ]);
                            setIcon(button, 'check');
                            new Notice('📷 Heatmap copied as image!');
                            setTimeout(() => setIcon(button, 'image'), 1500);
                        } catch (err) {
                            // Fallback: download the image
                            const link = document.createElement('a');
                            link.download = 'heatmap.png';
                            link.href = canvas.toDataURL('image/png');
                            link.click();
                            new Notice('📷 Image downloaded (clipboard not supported)');
                        }
                    }
                }, 'image/png');
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(url);
                new Notice('Failed to generate image');
            };
            
            img.src = url;
            
        } catch (err) {
            console.error('Failed to copy as image:', err);
            new Notice('Failed to copy as image');
        }
    }
    
    private colorizeTableOutput(text: string, settings: { 
        transposed: boolean, 
        excludeHeader: boolean,
        excludedRows: Set<number>,
        excludedCols: Set<number>,
        excludedCells: Set<string>
    }): string {
        const { transposed, excludeHeader, excludedRows, excludedCols, excludedCells } = settings;
        
        // Split into lines
        const lines = text.split('\n');
        if (lines.length < 2) return this.escapeHtml(text);
        
        // Detect column boundaries by analyzing whitespace patterns
        const columnBoundaries = this.detectColumnBoundaries(lines);
        
        // Determine which lines/columns to skip for stats
        const headerLineIdx = excludeHeader ? 0 : -1; // Skip first line if excludeHeader
        const headerColIdx = excludeHeader ? 0 : -1;  // Skip first column if excludeHeader
        
        // Extract numeric values BY COLUMN or BY ROW (depending on transposed)
        interface NumberPosition {
            line: number;
            start: number;
            end: number;
            value: number;
            columnIndex: number;
            groupKey: number; // Either column index or line index depending on mode
        }
        
        const numbersByGroup = new Map<number, number[]>();
        const numberPositions: NumberPosition[] = [];
        
        lines.forEach((line, lineIdx) => {
            // Match numbers (including negatives and decimals)
            const regex = /-?\d+\.?\d*(?:e[+-]?\d+)?/gi;
            let match;
            while ((match = regex.exec(line)) !== null) {
                const num = parseFloat(match[0]);
                if (!isNaN(num) && isFinite(num)) {
                    const colIdx = this.getColumnIndex(match.index, columnBoundaries);
                    
                    // Determine group key based on transposed mode
                    const groupKey = transposed ? lineIdx : colIdx;
                    
                    // Check if we should skip this value for stats
                    const cellKey = `${lineIdx},${colIdx}`;
                    const skipForStats = excludeHeader && (
                        (transposed && colIdx === headerColIdx) || 
                        (!transposed && lineIdx === headerLineIdx)
                    ) || excludedRows.has(lineIdx) 
                      || excludedCols.has(colIdx) 
                      || excludedCells.has(cellKey);
                    
                    if (!skipForStats) {
                        if (!numbersByGroup.has(groupKey)) {
                            numbersByGroup.set(groupKey, []);
                        }
                        numbersByGroup.get(groupKey)!.push(num);
                    }
                    
                    numberPositions.push({
                        line: lineIdx,
                        start: match.index,
                        end: match.index + match[0].length,
                        value: num,
                        columnIndex: colIdx,
                        groupKey: groupKey
                    });
                }
            }
        });
        
        if (numberPositions.length === 0) return this.escapeHtml(text);
        
        // Calculate statistics PER GROUP (column or row)
        const groupStats = new Map<number, {
            min: number;
            max: number;
            mean: number;
            median: number;
            q1: number;
            q3: number;
            lowerOutlier: number;
            upperOutlier: number;
        }>();
        
        numbersByGroup.forEach((numbers, groupKey) => {
            if (numbers.length === 0) return;
            
            const sorted = [...numbers].sort((a, b) => a - b);
            const min = sorted[0];
            const max = sorted[sorted.length - 1];
            const median = sorted[Math.floor(sorted.length / 2)];
            const q1 = sorted[Math.floor(sorted.length * 0.25)];
            const q3 = sorted[Math.floor(sorted.length * 0.75)];
            const iqr = q3 - q1;
            const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
            
            groupStats.set(groupKey, {
                min,
                max,
                mean,
                median,
                q1,
                q3,
                lowerOutlier: q1 - 1.5 * iqr,
                upperOutlier: q3 + 1.5 * iqr
            });
        });
        
        // Group positions by line for efficient processing
        const positionsByLine = new Map<number, NumberPosition[]>();
        numberPositions.forEach(pos => {
            if (!positionsByLine.has(pos.line)) {
                positionsByLine.set(pos.line, []);
            }
            positionsByLine.get(pos.line)!.push(pos);
        });
        
        // Process each line - wrap in div with line number for hover buttons
        const colorizedLines = lines.map((line, lineIdx) => {
            const positions = positionsByLine.get(lineIdx);
            const isRowExcluded = excludedRows.has(lineIdx);
            
            // Line wrapper with data attributes for interactivity
            let lineContent: string;
            
            if (!positions || positions.length === 0) {
                lineContent = this.escapeHtml(line);
            } else {
                // Sort positions by start index descending
                positions.sort((a, b) => b.start - a.start);
                
                let result = line;
                positions.forEach(pos => {
                    const cellKey = `${pos.line},${pos.columnIndex}`;
                    const isCellExcluded = excludedCells.has(cellKey) || excludedRows.has(pos.line) || excludedCols.has(pos.columnIndex);
                    const stats = groupStats.get(pos.groupKey);
                    
                    const numStr = line.substring(pos.start, pos.end);
                    
                    if (!stats || isCellExcluded) {
                        // Excluded or no stats - show dimmed
                        const excludedClass = isCellExcluded ? 'df-heatmap-excluded' : 'df-heatmap-header';
                        result = result.substring(0, pos.start) + 
                            `<span class="${excludedClass}" data-line="${pos.line}" data-col="${pos.columnIndex}" data-cell="${cellKey}">${this.escapeHtml(numStr)}</span>` + 
                            result.substring(pos.end);
                        return;
                    }
                    
                    const color = this.getHeatmapColor(
                        pos.value, 
                        stats.min, 
                        stats.max, 
                        stats.median, 
                        stats.mean, 
                        stats.lowerOutlier, 
                        stats.upperOutlier
                    );
                    const modeLabel = transposed ? `Row ${pos.line + 1}` : `Column ${pos.columnIndex + 1}`;
                    const coloredNum = `<span class="df-heatmap-value" style="background-color: ${color.bg}; color: ${color.text};" data-line="${pos.line}" data-col="${pos.columnIndex}" data-cell="${cellKey}" title="${modeLabel}&#10;Value: ${pos.value.toFixed(4)}&#10;Min: ${stats.min.toFixed(2)}, Max: ${stats.max.toFixed(2)}&#10;Mean: ${stats.mean.toFixed(2)}, Median: ${stats.median.toFixed(2)}&#10;Click to exclude">${this.escapeHtml(numStr)}</span>`;
                    result = result.substring(0, pos.start) + coloredNum + result.substring(pos.end);
                });
                
                lineContent = result;
            }
            
            // Wrap line with controls
            const rowExcludedClass = isRowExcluded ? ' df-row-excluded' : '';
            return `<span class="df-heatmap-line${rowExcludedClass}" data-line="${lineIdx}">${lineContent}<span class="df-heatmap-row-toggle" data-line="${lineIdx}" title="${isRowExcluded ? 'Include row' : 'Exclude row'}">${isRowExcluded ? '✓' : '×'}</span></span>`;
        });
        
        // Add column toggles at the top with column numbers
        const colToggles = columnBoundaries.map((_, colIdx) => {
            const isExcluded = excludedCols.has(colIdx);
            const icon = isExcluded ? '✓' : '×';
            return `<span class="df-heatmap-col-toggle${isExcluded ? ' excluded' : ''}" data-col="${colIdx}" title="Col ${colIdx}: ${isExcluded ? 'Click to include' : 'Click to exclude'}">${colIdx}<sub>${icon}</sub></span>`;
        }).join('');
        
        return `<div class="df-heatmap-col-controls"><span class="df-heatmap-col-label">Cols:</span>${colToggles}</div>` + colorizedLines.join('\n');
    }
    
    private setupHeatmapInteraction(pre: HTMLElement, outputId: number, text: string, renderContent: () => void) {
        const settings = this.outputHeatmapSettings.get(outputId)!;
        
        // Click on cell to toggle exclusion
        pre.querySelectorAll('.df-heatmap-value, .df-heatmap-excluded').forEach(el => {
            (el as HTMLElement).onclick = (e) => {
                e.stopPropagation();
                const cellKey = el.getAttribute('data-cell');
                if (cellKey) {
                    if (settings.excludedCells.has(cellKey)) {
                        settings.excludedCells.delete(cellKey);
                    } else {
                        settings.excludedCells.add(cellKey);
                    }
                    renderContent();
                }
            };
        });
        
        // Row toggle buttons
        pre.querySelectorAll('.df-heatmap-row-toggle').forEach(el => {
            (el as HTMLElement).onclick = (e) => {
                e.stopPropagation();
                const lineIdx = parseInt(el.getAttribute('data-line') || '0');
                if (settings.excludedRows.has(lineIdx)) {
                    settings.excludedRows.delete(lineIdx);
                } else {
                    settings.excludedRows.add(lineIdx);
                }
                renderContent();
            };
        });
        
        // Column toggle buttons
        pre.querySelectorAll('.df-heatmap-col-toggle').forEach(el => {
            (el as HTMLElement).onclick = (e) => {
                e.stopPropagation();
                const colIdx = parseInt(el.getAttribute('data-col') || '0');
                if (settings.excludedCols.has(colIdx)) {
                    settings.excludedCols.delete(colIdx);
                } else {
                    settings.excludedCols.add(colIdx);
                }
                renderContent();
            };
        });
    }
    
    private detectColumnBoundaries(lines: string[]): number[] {
        // Analyze lines to detect column boundaries based on whitespace patterns
        // Skip very short lines and find consistent spacing patterns
        const boundaries: number[] = [0];
        
        // Find lines with data (skip empty lines)
        const dataLines = lines.filter(l => l.trim().length > 10);
        if (dataLines.length < 2) return boundaries;
        
        // Use the second line (typically first data row) to detect columns
        // by finding positions where numbers start after whitespace
        const sampleLine = dataLines[1] || dataLines[0];
        
        // Find all positions where content starts after whitespace
        let inWhitespace = true;
        for (let i = 0; i < sampleLine.length; i++) {
            const char = sampleLine[i];
            if (char === ' ' || char === '\t') {
                inWhitespace = true;
            } else if (inWhitespace) {
                inWhitespace = false;
                if (i > 0) {
                    boundaries.push(i);
                }
            }
        }
        
        return boundaries;
    }
    
    private getColumnIndex(position: number, boundaries: number[]): number {
        // Find which column a position belongs to
        for (let i = boundaries.length - 1; i >= 0; i--) {
            if (position >= boundaries[i]) {
                return i;
            }
        }
        return 0;
    }
    
    private getHeatmapColor(value: number, min: number, max: number, median: number, mean: number, lowerOutlier: number, upperOutlier: number): { bg: string, text: string } {
        // Detect outliers
        if (value < lowerOutlier) {
            return { bg: 'rgba(139, 69, 19, 0.8)', text: '#fff' }; // Brown for low outliers
        }
        if (value > upperOutlier) {
            return { bg: 'rgba(128, 0, 128, 0.8)', text: '#fff' }; // Purple for high outliers
        }
        
        // Normalize value between 0 and 1
        const range = max - min;
        if (range === 0) return { bg: 'transparent', text: 'inherit' };
        
        const normalized = (value - min) / range;
        
        // Create a gradient from blue (low) -> cyan -> green -> yellow -> orange -> red (high)
        let r, g, b;
        
        if (normalized < 0.2) {
            // Blue to Cyan
            const t = normalized / 0.2;
            r = 0;
            g = Math.round(150 * t);
            b = 200;
        } else if (normalized < 0.4) {
            // Cyan to Green
            const t = (normalized - 0.2) / 0.2;
            r = 0;
            g = 150 + Math.round(50 * t);
            b = 200 - Math.round(200 * t);
        } else if (normalized < 0.6) {
            // Green to Yellow
            const t = (normalized - 0.4) / 0.2;
            r = Math.round(220 * t);
            g = 200;
            b = 0;
        } else if (normalized < 0.8) {
            // Yellow to Orange
            const t = (normalized - 0.6) / 0.2;
            r = 220 + Math.round(35 * t);
            g = 200 - Math.round(80 * t);
            b = 0;
        } else {
            // Orange to Red
            const t = (normalized - 0.8) / 0.2;
            r = 255;
            g = 120 - Math.round(120 * t);
            b = 0;
        }
        
        const bgColor = `rgba(${r}, ${g}, ${b}, 0.35)`;
        const textColor = normalized > 0.5 ? '#000' : '#fff';
        
        return { bg: bgColor, text: textColor };
    }
    
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
    private generateCopyableHtml(innerHtml: string): string {
        return `<!DOCTYPE html>
<html>
<head>
<style>
.df-heatmap-value { padding: 1px 3px; border-radius: 3px; font-family: monospace; }
pre { font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace; font-size: 12px; line-height: 1.4; }
</style>
</head>
<body><pre>${innerHtml}</pre></body>
</html>`;
    }
    
    private reRenderConsoleWithHeatmap() {
        if (!this.consoleOutput) return;
        
        // Re-render all table entries
        const entries = this.consoleOutput.querySelectorAll('.df-console-table');
        entries.forEach(entry => {
            const originalText = entry.getAttribute('data-original-text');
            if (originalText) {
                // Clear and re-render
                const timestamp = entry.querySelector('.df-console-time');
                const timestampText = timestamp?.textContent || '';
                entry.innerHTML = '';
                
                // Restore timestamp
                entry.createEl('span', { text: timestampText, cls: 'df-console-time' });
                
                // Re-render table
                this.renderTableOutput(entry as HTMLElement, originalText);
            }
        });
    }
    
    private async exportData(format: 'csv' | 'json' | 'markdown' | 'excel' | 'html') {
        const varName = this.options.variableName;
        let code = '';
        
        switch (format) {
            case 'csv':
                code = `print(${varName}.to_csv(index=False))`;
                break;
            case 'json':
                code = `print(${varName}.to_json(orient='records', indent=2))`;
                break;
            case 'markdown':
                code = `print(${varName}.to_markdown(index=False))`;
                break;
            case 'excel':
                code = `
import io
import base64
buffer = io.BytesIO()
${varName}.to_excel(buffer, index=False, engine='openpyxl')
buffer.seek(0)
print("EXCEL_BASE64:" + base64.b64encode(buffer.read()).decode())
`;
                break;
            case 'html':
                code = `print(${varName}.to_html(index=False, classes='dataframe'))`;
                break;
        }
        
        const result = await this.options.executePython(code, false);
        
        if (result.text && !result.error) {
            await navigator.clipboard.writeText(result.text);
            new Notice(`${format.toUpperCase()} copied to clipboard!`);
            this.appendToConsole(`✅ ${format.toUpperCase()} exported to clipboard`);
        } else if (result.error) {
            this.appendToConsole(`❌ Export error: ${result.error}`, true);
        }
    }
    
    private async copyToClipboard() {
        // Copy visible data as tab-separated values
        const filteredData = this.getFilteredData();
        const sortedData = this.getSortedData(filteredData);
        
        let text = this.data.columns.join('\t') + '\n';
        sortedData.forEach(row => {
            text += row.map(cell => cell === null ? '' : String(cell)).join('\t') + '\n';
        });
        
        await navigator.clipboard.writeText(text);
        new Notice('Data copied to clipboard!');
        this.appendToConsole('✅ Data copied to clipboard');
    }
    
    // ========== NEW METHODS ==========
    
    // Toggle transpose view
    private toggleTranspose() {
        this.isTransposed = !this.isTransposed;
        this.sortColumn = null;
        this.columnFilters.clear();
        this.currentPage = 1;
    this.renderModal(false);
    }
    
    // Reset all view settings
    private resetView() {
        this.filterText = '';
        this.sortColumn = null;
        this.sortAscending = true;
        this.columnFilters.clear();
        this.isTransposed = false;
        this.currentPage = 1;
        this.pageSize = 25;
        this.showAllRows = false;
        this.isEditMode = false;
        this.pendingChanges.clear();
    this.renderModal(false);
        new Notice('View reset!');
    }
    
    // Toggle edit mode
    private toggleEditMode() {
        this.isEditMode = !this.isEditMode;
        if (!this.isEditMode) {
            this.pendingChanges.clear();
        }
    this.renderModal(false);
        const status = this.isEditMode ? 'Edit mode enabled - Click cells to edit' : 'Edit mode disabled';
        this.appendToConsole(status);
        new Notice(status);
    }
    
    // Save pending changes to the DataFrame
    private async saveChanges() {
        if (this.pendingChanges.size === 0) {
            new Notice('No changes to save');
            return;
        }
        
        const varName = this.options.variableName;
        let code = '';
        
        // Build Python code to apply all changes
        for (const [key, value] of this.pendingChanges) {
            const [rowStr, colStr] = key.split(',');
            const row = parseInt(rowStr);
            const col = colStr;
            
            // Determine value type and format accordingly
            let formattedValue: string;
            if (value === null || value === 'None' || value === '') {
                formattedValue = 'None';
            } else if (typeof value === 'string' && isNaN(Number(value))) {
                formattedValue = `"${value.replace(/"/g, '\\"')}"`;
            } else {
                formattedValue = String(value);
            }
            
            code += `${varName}.at[${row}, '${col}'] = ${formattedValue}\n`;
        }
        
        code += `print(f"✅ Applied {${this.pendingChanges.size}} changes to ${varName}")`;
        
        this.appendToConsole(code, false, true);
        
        const result = await this.options.executePython(code, false);
        
        if (result.error) {
            this.appendToConsole(`${result.error}`, true);
            new Notice('Error saving changes');
        } else {
            this.appendToConsole(result.text || '✅ Changes saved successfully');
            this.pendingChanges.clear();
            await this.refreshData();
            new Notice(`Saved ${this.pendingChanges.size} changes!`);
        }
    }
    
    // Select a row for deletion or other operations
    private selectRow(rowIndex: number) {
        if (this.selectedRows.has(rowIndex)) {
            this.selectedRows.delete(rowIndex);
        } else {
            this.selectedRows.add(rowIndex);
        }
        this.renderTable();
        this.appendToConsole(`Row ${rowIndex} ${this.selectedRows.has(rowIndex) ? 'selected' : 'deselected'}`);
    }
    
    // Toggle column selection
    private toggleColumnSelection(colName: string) {
        if (this.selectedColumns.has(colName)) {
            this.selectedColumns.delete(colName);
        } else {
            this.selectedColumns.add(colName);
        }
        this.renderTable();
        this.appendToConsole(`Column "${colName}" ${this.selectedColumns.has(colName) ? 'selected' : 'deselected'}`);
    }
    
    // Show context menu
    private showContextMenu(e: MouseEvent, type: 'cell' | 'row' | 'column', colName: string, colIndex: number, rowIndex?: number, cellValue?: any) {
        // Remove any existing context menu
        document.querySelectorAll('.df-context-menu').forEach(m => m.remove());
        
        const menu = document.createElement('div');
        menu.className = 'df-context-menu df-dropdown-menu';
        
        const addItem = (icon: string, text: string, action: () => void, disabled: boolean = false) => {
            const item = menu.createEl('button', { cls: 'df-dropdown-item' + (disabled ? ' disabled' : '') });
            const iconEl = item.createSpan({ cls: 'df-menu-icon' });
            setIcon(iconEl, icon);
            item.createSpan({ text: text });
            if (!disabled) {
                item.onclick = () => {
                    menu.remove();
                    action();
                };
            }
        };
        
        const addSeparator = () => {
            menu.createEl('div', { cls: 'df-menu-separator' });
        };
        
        if (type === 'cell') {
            addItem('copy', 'Copy (Ctrl+C)', () => {
                this.clipboard = { type: 'cell', data: cellValue, rowIndex, colName };
                navigator.clipboard.writeText(String(cellValue ?? ''));
                this.appendToConsole(`Copied: "${cellValue}"`);
            });
            
            addItem('clipboard-paste', 'Paste (Ctrl+V)', async () => {
                const text = await navigator.clipboard.readText();
                if (rowIndex !== undefined) {
                    this.pendingChanges.set(`${rowIndex},${colName}`, text);
                    this.renderTable();
                    this.appendToConsole(`Pasted "${text}" to [${rowIndex}, ${colName}]`);
                }
            });
            
            addItem('scissors', 'Cut (Ctrl+X)', () => {
                this.clipboard = { type: 'cell', data: cellValue, rowIndex, colName };
                navigator.clipboard.writeText(String(cellValue ?? ''));
                if (rowIndex !== undefined) {
                    this.pendingChanges.set(`${rowIndex},${colName}`, null);
                    this.renderTable();
                }
                this.appendToConsole(`Cut: "${cellValue}"`);
            });
            
            addSeparator();
            
            addItem('pencil', 'Edit Cell', () => {
                if (!this.isEditMode) {
                    this.isEditMode = true;
                    this.renderTable();
                }
            });
            
            addItem('eraser', 'Clear Cell', () => {
                if (rowIndex !== undefined) {
                    this.pendingChanges.set(`${rowIndex},${colName}`, null);
                    this.renderTable();
                    this.appendToConsole(`Cleared [${rowIndex}, ${colName}]`);
                }
            });
        }
        
        if (type === 'row') {
            addItem('copy', 'Copy Row', async () => {
                const rowData = this.data.data[rowIndex!];
                const text = rowData.join('\t');
                await navigator.clipboard.writeText(text);
                this.clipboard = { type: 'row', data: rowData, rowIndex };
                this.appendToConsole(`Copied row ${rowIndex}`);
            });
            
            addSeparator();
            
            addItem('check-square', 'Select Row', () => {
                if (rowIndex !== undefined) this.selectRow(rowIndex);
            });
            
            addItem('plus', 'Insert Row Above', async () => {
                await this.insertRow(rowIndex!, 'above');
            });
            
            addItem('plus', 'Insert Row Below', async () => {
                await this.insertRow(rowIndex!, 'below');
            });
            
            addItem('copy-plus', 'Duplicate Row', async () => {
                await this.duplicateRow(rowIndex!);
            });
            
            addSeparator();
            
            addItem('trash-2', 'Delete Row', async () => {
                await this.deleteRow(rowIndex!);
            });
        }
        
        if (type === 'column') {
            addItem('copy', 'Copy Column', async () => {
                const colIdx = this.data.columns.indexOf(colName);
                const colData = this.data.data.map(row => row[colIdx]);
                const text = colData.join('\n');
                await navigator.clipboard.writeText(text);
                this.clipboard = { type: 'column', data: colData, colName };
                this.appendToConsole(`Copied column "${colName}"`);
            });
            
            addSeparator();
            
            addItem('check-square', 'Select Column', () => {
                this.toggleColumnSelection(colName);
            });
            
            addItem('arrow-up-down', 'Sort Ascending', () => {
                this.sortColumn = colName;
                this.sortAscending = true;
                this.renderTable();
            });
            
            addItem('arrow-down-up', 'Sort Descending', () => {
                this.sortColumn = colName;
                this.sortAscending = false;
                this.renderTable();
            });
            
            addSeparator();
            
            addItem('plus', 'Insert Column Left', async () => {
                await this.insertColumn(colIndex, 'left');
            });
            
            addItem('plus', 'Insert Column Right', async () => {
                await this.insertColumn(colIndex, 'right');
            });
            
            addItem('copy-plus', 'Duplicate Column', async () => {
                await this.duplicateColumn(colName);
            });
            
            addItem('text-cursor-input', 'Rename Column', () => {
                this.renameColumn(colName);
            });
            
            addSeparator();
            
            addItem('trash-2', 'Delete Column', async () => {
                await this.deleteColumn(colName);
            });
        }
        
        // Position menu
        menu.style.position = 'fixed';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.zIndex = '10001';
        
        document.body.appendChild(menu);
        
        // Close on click outside
        const closeMenu = (ev: MouseEvent) => {
            if (!menu.contains(ev.target as Node)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 10);
        
        // Adjust if menu goes off screen
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${window.innerWidth - rect.width - 10}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${window.innerHeight - rect.height - 10}px`;
        }
    }
    
    // Row operations
    private async insertRow(rowIndex: number, position: 'above' | 'below') {
        const insertIdx = position === 'above' ? rowIndex : rowIndex + 1;
        const code = `
import pandas as pd
# Insert empty row at index ${insertIdx}
new_row = pd.DataFrame([[None] * len(${this.options.variableName}.columns)], columns=${this.options.variableName}.columns)
${this.options.variableName} = pd.concat([${this.options.variableName}.iloc[:${insertIdx}], new_row, ${this.options.variableName}.iloc[${insertIdx}:]]).reset_index(drop=True)
print(f"Inserted row at index ${insertIdx}")
`;
        const result = await this.options.executePython(code, false);
        this.appendToConsole(result.text || result.error || 'Row inserted');
        if (!result.error) await this.refreshData();
    }
    
    private async duplicateRow(rowIndex: number) {
        const code = `
import pandas as pd
# Duplicate row ${rowIndex}
row_to_dup = ${this.options.variableName}.iloc[[${rowIndex}]]
${this.options.variableName} = pd.concat([${this.options.variableName}.iloc[:${rowIndex + 1}], row_to_dup, ${this.options.variableName}.iloc[${rowIndex + 1}:]]).reset_index(drop=True)
print(f"Duplicated row ${rowIndex}")
`;
        const result = await this.options.executePython(code, false);
        this.appendToConsole(result.text || result.error || 'Row duplicated');
        if (!result.error) await this.refreshData();
    }
    
    private async deleteRow(rowIndex: number) {
        const code = `
${this.options.variableName} = ${this.options.variableName}.drop(${this.options.variableName}.index[${rowIndex}]).reset_index(drop=True)
print(f"Deleted row ${rowIndex}")
`;
        const result = await this.options.executePython(code, false);
        this.appendToConsole(result.text || result.error || 'Row deleted');
        if (!result.error) {
            this.selectedRows.delete(rowIndex);
            await this.refreshData();
        }
    }
    
    // Column operations
    private async insertColumn(colIndex: number, position: 'left' | 'right') {
        const insertIdx = position === 'left' ? colIndex : colIndex + 1;
        const newColName = `new_col_${Date.now()}`;
        const code = `
import pandas as pd
# Insert new column at position ${insertIdx}
${this.options.variableName}.insert(${insertIdx}, '${newColName}', None)
print(f"Inserted column '${newColName}' at position ${insertIdx}")
`;
        const result = await this.options.executePython(code, false);
        this.appendToConsole(result.text || result.error || 'Column inserted');
        if (!result.error) await this.refreshData();
    }
    
    private async duplicateColumn(colName: string) {
        const newColName = `${colName}_copy`;
        const code = `
${this.options.variableName}['${newColName}'] = ${this.options.variableName}['${colName}'].copy()
print(f"Duplicated column '${colName}' to '${newColName}'")
`;
        const result = await this.options.executePython(code, false);
        this.appendToConsole(result.text || result.error || 'Column duplicated');
        if (!result.error) await this.refreshData();
    }
    
    private renameColumn(colName: string) {
        // Create inline rename input
        const th = this.tableContainer?.querySelector(`th .df-th-name`);
        // Use a prompt for simplicity
        const newName = prompt('New column name:', colName);
        if (newName && newName !== colName) {
            this.renameColumnAsync(colName, newName);
        }
    }
    
    private async renameColumnAsync(oldName: string, newName: string) {
        const code = `
${this.options.variableName} = ${this.options.variableName}.rename(columns={'${oldName}': '${newName}'})
print(f"Renamed column '${oldName}' to '${newName}'")
`;
        const result = await this.options.executePython(code, false);
        this.appendToConsole(result.text || result.error || 'Column renamed');
        if (!result.error) {
            this.selectedColumns.delete(oldName);
            await this.refreshData();
        }
    }
    
    private async deleteColumn(colName: string) {
        const code = `
${this.options.variableName} = ${this.options.variableName}.drop(columns=['${colName}'])
print(f"Deleted column '${colName}'")
`;
        const result = await this.options.executePython(code, false);
        this.appendToConsole(result.text || result.error || 'Column deleted');
        if (!result.error) {
            this.selectedColumns.delete(colName);
            await this.refreshData();
        }
    }
    
    // Edit a single cell
    private editCell(td: HTMLElement, rowIndex: number, colIndex: number, colName: string, currentValue: any, dtype: string) {
        // Don't create multiple inputs
        if (td.querySelector('input') || this.isEditingCell) return;
        
        this.isEditingCell = true;
        
        // Store original content
        const originalContent = td.innerHTML;
        
        // Clear cell content safely
        while (td.firstChild) {
            td.removeChild(td.firstChild);
        }
        td.addClass('df-cell-editing');
        
        // Create input
        const input = td.createEl('input', {
            type: 'text',
            cls: 'df-cell-input',
            value: currentValue === null || currentValue === undefined ? '' : String(currentValue)
        });
        
        input.focus();
        input.select();
        
        let saved = false;
        
        const saveValue = () => {
            if (saved) return;
            saved = true;
            this.isEditingCell = false;
            
            const newValue = input.value;
            const cellKey = `${rowIndex},${colName}`;
            
            // Check if value actually changed
            const originalValue = this.data.data[rowIndex]?.[colIndex];
            if (newValue !== String(originalValue ?? '')) {
                // Store as appropriate type
                let typedValue: any = newValue;
                if (newValue === '' || newValue.toLowerCase() === 'none' || newValue.toLowerCase() === 'null') {
                    typedValue = null;
                } else if (dtype.includes('int')) {
                    typedValue = parseInt(newValue) || newValue;
                } else if (dtype.includes('float')) {
                    typedValue = parseFloat(newValue) || newValue;
                }
                
                this.pendingChanges.set(cellKey, typedValue);
                
                // Update the cell display without full re-render
                td.removeClass('df-cell-editing');
                while (td.firstChild) {
                    td.removeChild(td.firstChild);
                }
                td.textContent = newValue;
                td.addClass('df-cell-modified');
                
                this.appendToConsole(`Changed [${rowIndex}, ${colName}]: "${originalValue}" → "${typedValue}"`);
            } else {
                // Restore original content
                td.removeClass('df-cell-editing');
                while (td.firstChild) {
                    td.removeChild(td.firstChild);
                }
                td.innerHTML = originalContent;
            }
        };
        
        const cancelEdit = () => {
            if (saved) return;
            saved = true;
            this.isEditingCell = false;
            
            td.removeClass('df-cell-editing');
            while (td.firstChild) {
                td.removeChild(td.firstChild);
            }
            td.innerHTML = originalContent;
        };
        
        input.onblur = () => {
            setTimeout(saveValue, 10); // Small delay to prevent race conditions
        };
        
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                input.blur();
                // Move to next cell
                const nextColIndex = colIndex + (e.shiftKey ? -1 : 1);
                if (nextColIndex >= 0 && nextColIndex < this.data.columns.length) {
                    setTimeout(() => {
                        const nextTd = td.parentElement?.children[nextColIndex + 1] as HTMLElement; // +1 for index column
                        if (nextTd) nextTd.click();
                    }, 100);
                }
            }
        };
    }
    
    // Show column selector dropdown for tools
    private showColumnSelector(e: MouseEvent, tool: string) {
        const menu = document.createElement('div');
        menu.className = 'df-dropdown-menu df-column-selector';
        
        menu.createEl('div', { text: `Select column:`, cls: 'df-dropdown-header' });
        
        this.data.columns.forEach(col => {
            const item = menu.createEl('button', { cls: 'df-dropdown-item' });
            item.createSpan({ text: col });
            const dtype = this.data.dtypes[col] || 'object';
            item.createSpan({ text: ` (${this.getShortType(dtype)})`, cls: 'df-dropdown-dtype' });
            
            item.onclick = () => {
                menu.remove();
                this.runDSTool(tool, col);
            };
        });
        
        // Position menu
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        this.positionDropdownMenu(menu, rect);
        document.body.appendChild(menu);
        
        // Close on click outside
        const closeMenu = (ev: MouseEvent) => {
            if (!menu.contains(ev.target as Node)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
    
    // Show Save As dialog
    private showSaveAsDialog() {
        const modal = document.createElement('div');
        modal.className = 'df-save-dialog-overlay';
        
        const dialog = modal.createEl('div', { cls: 'df-save-dialog' });
        dialog.createEl('h3', { text: '💾 Save DataFrame As', cls: 'df-save-title' });
        
        const form = dialog.createEl('div', { cls: 'df-save-form' });
        form.createEl('label', { text: 'Variable name:', cls: 'df-save-label' });
        
        const input = form.createEl('input', { 
            type: 'text',
            placeholder: `${this.options.variableName}_copy`,
            cls: 'df-save-input'
        });
        input.value = `${this.options.variableName}_copy`;
        
        const hint = form.createEl('div', { 
            text: 'This will create a copy of the current DataFrame view', 
            cls: 'df-save-hint' 
        });
        
        const options = form.createEl('div', { cls: 'df-save-options' });
        
        const chkFiltered = options.createEl('label', { cls: 'df-save-option' });
        const cbFiltered = chkFiltered.createEl('input', { type: 'checkbox' });
        cbFiltered.checked = this.filterText.length > 0 || this.columnFilters.size > 0;
        chkFiltered.createSpan({ text: ' Apply current filters' });
        
        const chkSorted = options.createEl('label', { cls: 'df-save-option' });
        const cbSorted = chkSorted.createEl('input', { type: 'checkbox' });
        cbSorted.checked = this.sortColumn !== null;
        chkSorted.createSpan({ text: ' Apply current sorting' });
        
        const buttons = dialog.createEl('div', { cls: 'df-save-buttons' });
        
        const btnCancel = buttons.createEl('button', { text: 'Cancel', cls: 'df-save-btn df-save-cancel' });
        btnCancel.onclick = () => modal.remove();
        
        const btnSave = buttons.createEl('button', { text: 'Save', cls: 'df-save-btn df-save-confirm' });
        btnSave.onclick = async () => {
            const newName = input.value.trim();
            if (!newName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
                new Notice('Invalid variable name!');
                return;
            }
            
            let code = '';
            if (cbFiltered.checked && (this.filterText || this.columnFilters.size > 0)) {
                // Build filter code
                code = `${newName} = ${this.options.variableName}.copy()\n`;
                // Note: For simplicity, we'll just copy. Full filter logic would be complex.
                code += `# Filters applied in viewer are visual only. Use Python to filter.\n`;
            }
            
            code = `${newName} = ${this.options.variableName}.copy()\nprint(f"Saved as '{newName}' with shape {${newName}.shape}")`;
            
            const result = await this.options.executePython(code, false);
            if (result.error) {
                this.appendToConsole(`❌ Error: ${result.error}`, true);
            } else {
                this.appendToConsole(`✅ ${result.text || 'Saved successfully'}`);
                new Notice(`DataFrame saved as "${newName}"`);
            }
            modal.remove();
        };
        
        document.body.appendChild(modal);
        input.focus();
        input.select();
    }
    
    // Show compare options
    private showCompareOptions(e: MouseEvent) {
        const menu = document.createElement('div');
        menu.className = 'df-dropdown-menu df-compare-menu';
        
        menu.createEl('div', { text: 'Compare with:', cls: 'df-dropdown-header' });
        
        // Option: Compare with another variable
        const optOther = menu.createEl('button', { cls: 'df-dropdown-item' });
        setIcon(optOther.createSpan({ cls: 'df-dropdown-icon' }), 'git-compare');
        optOther.createSpan({ text: ' Another DataFrame...' });
        optOther.onclick = () => {
            menu.remove();
            this.showCompareDialog();
        };
        
        // Option: Show differences from original
        const optDiff = menu.createEl('button', { cls: 'df-dropdown-item' });
        setIcon(optDiff.createSpan({ cls: 'df-dropdown-icon' }), 'diff');
        optDiff.createSpan({ text: ' Show column stats' });
        optDiff.onclick = () => {
            menu.remove();
            this.runDSTool('describe');
        };
        
        // Option: Memory profile
        const optMemory = menu.createEl('button', { cls: 'df-dropdown-item' });
        setIcon(optMemory.createSpan({ cls: 'df-dropdown-icon' }), 'hard-drive');
        optMemory.createSpan({ text: ' Memory usage' });
        optMemory.onclick = async () => {
            menu.remove();
            const code = `print(${this.options.variableName}.memory_usage(deep=True).to_string())`;
            const result = await this.options.executePython(code, false);
            if (result.text) {
                this.appendToConsole('Memory usage:\n' + result.text);
            }
        };
        
        // Position menu
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        this.positionDropdownMenu(menu, rect);
        document.body.appendChild(menu);
        
        // Close on click outside
        const closeMenu = (ev: MouseEvent) => {
            if (!menu.contains(ev.target as Node)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
    
    // Show compare dialog
    private async showCompareDialog() {
        const modal = document.createElement('div');
        modal.className = 'df-save-dialog-overlay';
        
        const dialog = modal.createEl('div', { cls: 'df-save-dialog df-compare-dialog' });
        dialog.createEl('h3', { text: '🔍 Compare DataFrames', cls: 'df-save-title' });
        
        const form = dialog.createEl('div', { cls: 'df-save-form' });
        form.createEl('label', { text: 'Compare with variable:', cls: 'df-save-label' });
        
        const input = form.createEl('input', { 
            type: 'text',
            placeholder: 'other_df',
            cls: 'df-save-input'
        });
        
        const hint = form.createEl('div', { 
            text: 'Enter the name of another DataFrame variable to compare', 
            cls: 'df-save-hint' 
        });
        
        const resultArea = dialog.createEl('div', { cls: 'df-compare-result' });
        
        const buttons = dialog.createEl('div', { cls: 'df-save-buttons' });
        
        const btnCancel = buttons.createEl('button', { text: 'Close', cls: 'df-save-btn df-save-cancel' });
        btnCancel.onclick = () => modal.remove();
        
        const btnCompare = buttons.createEl('button', { text: 'Compare', cls: 'df-save-btn df-save-confirm' });
        btnCompare.onclick = async () => {
            const otherName = input.value.trim();
            if (!otherName) {
                new Notice('Enter a variable name!');
                return;
            }
            
            resultArea.empty();
            resultArea.createEl('div', { text: 'Comparing...', cls: 'df-compare-loading' });
            
            const code = `
import pandas as pd
df1 = ${this.options.variableName}
df2 = ${otherName}

result = []
result.append(f"Shape: {df1.shape} vs {df2.shape}")
result.append(f"Columns in both: {len(set(df1.columns) & set(df2.columns))}")
result.append(f"Columns only in ${this.options.variableName}: {list(set(df1.columns) - set(df2.columns))}")
result.append(f"Columns only in ${otherName}: {list(set(df2.columns) - set(df1.columns))}")

common_cols = list(set(df1.columns) & set(df2.columns))
if common_cols and len(df1) == len(df2):
    diffs = 0
    for col in common_cols:
        try:
            diffs += (df1[col] != df2[col]).sum()
        except:
            pass
    result.append(f"Cell differences in common columns: {diffs}")

print("\\n".join(result))
`;
            
            const result = await this.options.executePython(code, false);
            resultArea.empty();
            
            if (result.error) {
                resultArea.createEl('div', { text: `Error: ${result.error}`, cls: 'df-compare-error' });
            } else if (result.text) {
                const lines = result.text.split('\n');
                lines.forEach(line => {
                    resultArea.createEl('div', { text: line, cls: 'df-compare-line' });
                });
            }
        };
        
        document.body.appendChild(modal);
        input.focus();
    }
}

/**
 * Helper function to extract DataFrame data from Python
 */
export function getDataFrameExtractionCode(variableName: string): string {
    return `
import json
import pandas as pd

def __extract_df_data(df):
    if not isinstance(df, pd.DataFrame):
        raise ValueError("Variable is not a DataFrame")
    
    # Limit to first 10000 rows for performance
    df_limited = df.head(10000)
    
    # Convert data to serializable format
    data = []
    for _, row in df_limited.iterrows():
        row_data = []
        for val in row:
            if pd.isna(val):
                row_data.append(None)
            elif hasattr(val, 'item'):  # numpy types
                row_data.append(val.item())
            else:
                row_data.append(val)
        data.append(row_data)
    
    return {
        "columns": df.columns.tolist(),
        "data": data,
        "dtypes": {c: str(df[c].dtype) for c in df.columns},
        "shape": list(df.shape),
        "memory_usage": int(df.memory_usage(deep=True).sum()),
        "null_counts": {c: int(v) for c, v in df.isnull().sum().items()}
    }

print(json.dumps(__extract_df_data(${variableName}), default=str))
`;
}
