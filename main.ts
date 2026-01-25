import { Plugin, ItemView, WorkspaceLeaf, Notice, setIcon, MarkdownView, Editor, PluginSettingTab, Setting, App, TFile, Modal, TFolder, normalizePath, AbstractInputSuggest } from 'obsidian';
import { ViewPlugin, Decoration, WidgetType, DecorationSet, ViewUpdate, EditorView } from '@codemirror/view';
import { RangeSetBuilder, EditorState } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap } from '@codemirror/search';
import { lintKeymap } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import { t, Language, TRANSLATIONS } from './i18n';

// --- CONFIGURATION ---
const PYODIDE_VERSION = 'v0.23.4';
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;
const VIEW_TYPE_DATA_STUDIO = "data-science-studio-view";

export interface PyDataSettings {
    requestedPackages: string[];
    autoloadPackages: string[];
    language: string;
    imageSaveMode: 'base64' | 'folder' | 'root' | 'ask';
    imageFolderPath: string;
}

const DEFAULT_SETTINGS: PyDataSettings = {
    requestedPackages: [],
    autoloadPackages: [],
    language: 'en',
    imageSaveMode: 'base64',
    imageFolderPath: ''
};

declare global {
    interface Window {
        loadPyodide: any;
        pyodide: any;
        require: any;
        process: any;
        module: any;
    }
}

// --- SYNTAX HIGHLIGHTING (Obsidian Match) ---
const obsidianHighlightStyle = HighlightStyle.define([
    { tag: tags.keyword, color: "var(--code-keyword)" },
    { tag: tags.operator, color: "var(--code-operator)" },
    { tag: tags.string, color: "var(--code-string)" },
    { tag: tags.number, color: "var(--code-number)" },
    { tag: tags.comment, color: "var(--code-comment)", fontStyle: "italic" },
    { tag: tags.function(tags.variableName), color: "var(--code-function)" },
    { tag: tags.variableName, color: "var(--code-normal)" },
    { tag: tags.propertyName, color: "var(--code-property)" },
    { tag: tags.className, color: "var(--code-class)" },
    { tag: tags.bool, color: "var(--code-bool)" },
    { tag: tags.bracket, color: "var(--code-punctuation)" },
    { tag: tags.punctuation, color: "var(--code-punctuation)" },
]);

// --- 1. La Vue Latérale (Studio Notebook) ---
class DataStudioView extends ItemView {
    plugin: PyDataPlugin;
    codeBlocks: { id: string, code: string, editor?: EditorView }[] = [];
    isSplit: boolean = false;
    outputContainer: HTMLElement | null = null;
    varContainer: HTMLElement | null = null;
    pipContainer: HTMLElement | null = null;
    listContainer: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: PyDataPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return VIEW_TYPE_DATA_STUDIO; }
    getDisplayText() { return t(this.plugin.settings.language, "studio_title"); }
    getIcon() { return "activity"; }

    async onOpen() {
        const container = this.contentEl;
        container.empty();
        container.addClass("ds-studio-container");

        // HEADER
        const header = container.createEl("div", { cls: "ds-studio-header" });
        header.createEl("h4", { text: t(this.plugin.settings.language, "studio_title") });

        const actionsDiv = header.createEl("div", { cls: "ds-actions" });

        const btnRunAll = actionsDiv.createEl("button", { text: t(this.plugin.settings.language, "run_all"), cls: "ds-btn-header run-all" });
        btnRunAll.onclick = () => this.runAllBlocks();

        const btnFlush = actionsDiv.createEl("button", { cls: "ds-btn-header" });
        const flushIconSpan = btnFlush.createSpan({ cls: "py-btn-icon" });
        setIcon(flushIconSpan, "refresh-cw");
        btnFlush.createSpan({ text: t(this.plugin.settings.language, "flush") });
        btnFlush.setAttribute("title", t(this.plugin.settings.language, "flush_tooltip_detailed"));
        btnFlush.onclick = async () => {
            btnFlush.addClass('ds-is-loading');
            this.plugin.settings.requestedPackages = [];
            await this.plugin.saveSettings();
            this.plugin.resetPyodide();
            this.clearConsole();
            this.refreshVariables(true);
            this.refreshPackages();
            btnFlush.removeClass('ds-is-loading');
            new Notice(t(this.plugin.settings.language, "python_reset_done"));
        };

        const btnClear = actionsDiv.createEl("button", { text: t(this.plugin.settings.language, "clear_all"), cls: "ds-btn-header" });
        btnClear.onclick = () => {
            this.codeBlocks = [];
            this.renderList();
            this.clearConsole();
            new Notice(t(this.plugin.settings.language, "all_cleared"));
        };

        // LISTE
        this.listContainer = container.createEl("div", { cls: "ds-block-list" });

        // RESIZER
        const resizer = container.createEl("div", { cls: "ds-resizer" });

        const footer = container.createEl("div", { cls: "ds-studio-footer" });

        // Resizer Logic
        let isResizing = false;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            resizer.addClass('ds-resizing');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const containerRect = container.getBoundingClientRect();
            // Calculate new height: Total height - (Mouse Y - Container Top)
            // But footer is at bottom, so: Container Bottom - Mouse Y
            const newHeight = containerRect.bottom - e.clientY;

            if (newHeight > 100 && newHeight < containerRect.height - 100) {
                footer.style.height = `${newHeight}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                resizer.removeClass('ds-resizing');
            }
        });

        const footerHeader = footer.createEl("div", { cls: "ds-footer-header" });
        footerHeader.createEl("span", { text: t(this.plugin.settings.language, "console_title"), cls: "ds-footer-title" });

        const footerActions = footerHeader.createEl("div", { cls: "ds-footer-actions" });

        const btnVars = footerActions.createEl("button", { text: t(this.plugin.settings.language, "variables"), cls: "ds-btn-mini" });
        btnVars.onclick = () => this.showVariableExplorer();

        const btnPip = footerActions.createEl("button", { text: t(this.plugin.settings.language, "packages"), cls: "ds-btn-mini" });
        btnPip.onclick = () => this.showPackageManager();

        const btnConsole = footerActions.createEl("button", { text: t(this.plugin.settings.language, "console"), cls: "ds-btn-mini" });
        btnConsole.onclick = () => this.renderConsole();

        const btnWipe = footerActions.createEl("button", { text: t(this.plugin.settings.language, "clear_log"), cls: "ds-btn-mini" });
        btnWipe.onclick = () => {
            this.clearConsole();
            new Notice(t(this.plugin.settings.language, "log_cleared"));
        };

        const btnSplit = footerActions.createEl("button", { cls: "ds-btn-mini ds-btn-split" });
        setIcon(btnSplit, "columns");
        btnSplit.setAttribute("title", t(this.plugin.settings.language, "split_view"));
        btnSplit.onclick = () => {
            this.isSplit = !this.isSplit;
            if (this.isSplit) {
                footer.addClass("ds-split-mode");
                btnSplit.addClass("is-active");
                this.outputContainer?.removeClass("ds-hidden");
                this.varContainer?.removeClass("ds-hidden");
                this.pipContainer?.addClass("ds-hidden");
                this.refreshVariables();
            } else {
                footer.removeClass("ds-split-mode");
                btnSplit.removeClass("is-active");
                // On revient à la vue console par défaut
                this.renderConsole();
            }
        };

        this.outputContainer = footer.createEl("div", { cls: "ds-output-area" });
        this.outputContainer.innerHTML = `<div class='ds-placeholder'>${t(this.plugin.settings.language, "console_ready")}</div>`;

        this.varContainer = footer.createEl("div", { cls: "ds-output-area ds-hidden" });
        this.pipContainer = footer.createEl("div", { cls: "ds-output-area ds-hidden" });
    }

    async onClose() {
        this.outputContainer = null;
        this.listContainer = null;
    }

    addBlock(code: string) {
        const id = Date.now().toString();
        this.codeBlocks.push({ id, code });
        this.renderList();
    }

    async appendOutput(result: { text: string, image: string | null, error?: string }, blockIndex: number, fromRunAll = false) {
        if (!this.outputContainer) return;

        if (this.outputContainer.querySelector('.ds-placeholder') || this.outputContainer.querySelector('h5')) {
            this.outputContainer.empty();
        }

        const entry = this.outputContainer.createEl("div", { cls: "ds-log-entry" });
        if (fromRunAll) entry.addClass("ds-run-all-entry");
        entry.setAttribute("draggable", "true");

        // Drag and Drop du résultat vers le Markdown
        entry.addEventListener('dragstart', (e) => {
            const dragData = JSON.stringify(result);
            e.dataTransfer?.setData('application/x-obsidian-pydata-result', dragData);

            // Fallback pour les autres applications
            let fallbackMarkdown = `\n> [!abstract] ${t(this.plugin.settings.language, "result_python")}\n`;
            if (result.error) {
                fallbackMarkdown = `\n> [!error] ${t(this.plugin.settings.language, "error_python")}\n`;
                result.error.split('\n').forEach(line => fallbackMarkdown += `> ${line}\n`);
            } else {
                if (result.text) {
                    fallbackMarkdown += `> \`\`\`text\n`;
                    result.text.split('\n').forEach(line => fallbackMarkdown += `> ${line}\n`);
                    fallbackMarkdown += `> \`\`\`\n`;
                }
                if (result.image) {
                    fallbackMarkdown += `> ![Graph](data:image/png;base64,${result.image})\n`;
                }
            }
            e.dataTransfer?.setData('text/plain', fallbackMarkdown + "\n");
        });

        // Header du Log
        const titleRow = entry.createEl("div", { cls: "ds-log-title-row" });
        const title = titleRow.createEl("span", { cls: "ds-log-title" });
        title.innerHTML = `<strong>Bloc #${blockIndex + 1}</strong> <span style='font-size:0.8em; color:var(--text-muted)'>${new Date().toLocaleTimeString()}</span>`;

        if (fromRunAll) {
            titleRow.createEl("span", { text: t(this.plugin.settings.language, "from_run_all"), cls: "ds-run-all-badge" });
        }

        if (result.error) {
            entry.createEl("div", { cls: "ds-log-error", text: result.error });
            title.style.color = "var(--text-error)";
        } else {
            if (result.text) {
                entry.createEl("pre", { cls: "ds-log-text", text: result.text });
            }
            if (result.image) {
                const img = entry.createEl("img", { cls: "ds-log-img" });
                img.src = `data:image/png;base64,${result.image}`;
            }
            if (!result.text && !result.image) {
                entry.createEl("div", { text: t(this.plugin.settings.language, "executed_no_output"), cls: "ds-log-empty" });
            }
        }
        this.outputContainer.scrollTop = this.outputContainer.scrollHeight;
    }

    clearConsole() {
        if (this.outputContainer) this.outputContainer.innerHTML = `<div class='ds-placeholder'>${t(this.plugin.settings.language, "console_ready")}</div>`;
    }

    renderList() {
        if (!this.listContainer) return;
        this.listContainer.empty();

        this.codeBlocks.forEach((block, index) => {
            const card = this.listContainer!.createEl("div", { cls: "ds-code-card" });
            card.setAttribute("draggable", "true");

            const cardHeader = card.createEl("div", { cls: "ds-card-header" });
            cardHeader.createSpan({ text: `Bloc #${index + 1}` });

            const cardActions = cardHeader.createEl("div", { cls: "ds-card-actions" });

            const runBtn = cardActions.createEl("button", { cls: "ds-card-btn run" });
            setIcon(runBtn, "play");
            runBtn.onclick = (e) => {
                e.stopPropagation();
                this.runSingleBlock(index, false, true, runBtn);
            };

            const deleteBtn = cardActions.createEl("button", { cls: "ds-card-btn del" });
            setIcon(deleteBtn, "trash");
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                this.codeBlocks.splice(index, 1);
                this.renderList();
            };

            // ZONE D'EDITION (CodeMirror 6)
            const editorWrapper = card.createEl("div", { cls: "ds-card-editor-wrapper" });

            const startState = EditorState.create({
                doc: block.code,
                extensions: [
                    lineNumbers(),
                    highlightActiveLineGutter(),
                    highlightActiveLine(),
                    history(),
                    bracketMatching(),
                    closeBrackets(),
                    autocompletion(),
                    indentOnInput(),
                    syntaxHighlighting(obsidianHighlightStyle, { fallback: true }),
                    python(),
                    keymap.of([
                        ...closeBracketsKeymap,
                        ...defaultKeymap,
                        ...searchKeymap,
                        ...historyKeymap,
                        ...completionKeymap,
                        ...lintKeymap
                    ]),
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) {
                            block.code = update.state.doc.toString();
                        }
                    }),
                    EditorView.theme({
                        "&": {
                            height: "auto",
                            backgroundColor: "var(--code-background)",
                            color: "var(--code-normal)"
                        },
                        ".cm-scroller": { overflow: "visible" },
                        ".cm-content": { fontFamily: "var(--pydata-font-mono)", fontSize: "13px" },
                        ".cm-gutters": {
                            backgroundColor: "var(--code-background)",
                            border: "none",
                            color: "var(--text-muted)",
                            borderRight: "1px solid var(--pydata-border-glass)"
                        },
                        ".cm-activeLine": { backgroundColor: "var(--background-modifier-hover)" },
                        ".cm-activeLineGutter": { backgroundColor: "var(--background-modifier-hover)" },
                        ".cm-cursor": { borderLeftColor: "var(--text-normal)" },
                        "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--text-selection)" }
                    })
                ]
            });

            const editorView = new EditorView({
                state: startState,
                parent: editorWrapper
            });

            block.editor = editorView;

            editorWrapper.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });

            // Drag and Drop Logic (Sur la carte elle-même)
            card.addEventListener('dragstart', (e) => {
                // Pour le réordonnancement interne
                e.dataTransfer?.setData('application/x-obsidian-pydata-index', index.toString());
                // Pour le drag-and-drop vers le Markdown
                const markdownCode = `\`\`\`python\n${block.code}\n\`\`\``;
                e.dataTransfer?.setData('text/plain', markdownCode);

                card.addClass('dragging');
                if (this.listContainer) this.listContainer.addClass('ds-dragging-mode');
            });
            card.addEventListener('dragend', () => {
                card.removeClass('dragging');
                if (this.listContainer) this.listContainer.removeClass('ds-dragging-mode');
            });
            card.addEventListener('dragover', (e) => e.preventDefault());
            card.addEventListener('drop', (e) => {
                e.preventDefault();
                const internalIndex = e.dataTransfer?.getData('application/x-obsidian-pydata-index');
                if (internalIndex !== undefined && internalIndex !== "") {
                    const oldIndex = parseInt(internalIndex);
                    if (oldIndex !== index) {
                        const item = this.codeBlocks.splice(oldIndex, 1)[0];
                        this.codeBlocks.splice(index, 0, item);
                        this.renderList();
                    }
                }
            });
        });
    }

    async runAllBlocks() {
        const btnRunAll = this.contentEl.querySelector('.ds-btn-header.run-all') as HTMLButtonElement;
        if (btnRunAll) {
            btnRunAll.addClass('ds-is-loading');
            setIcon(btnRunAll, "loader");
        }

        this.clearConsole();
        for (let i = 0; i < this.codeBlocks.length; i++) {
            await this.runSingleBlock(i, false, false, undefined, true);
        }
        this.refreshVariables();

        if (btnRunAll) {
            btnRunAll.removeClass('ds-is-loading');
            btnRunAll.innerText = t(this.plugin.settings.language, "run_all");
        }
        new Notice(t(this.plugin.settings.language, "executed_success"));
    }

    async runSingleBlock(index: number, clear = false, showNotice = true, btn?: HTMLButtonElement, fromRunAll = false) {
        if (clear) this.clearConsole();
        const block = this.codeBlocks[index];
        if (!block) return;

        if (btn) {
            btn.addClass('ds-is-loading');
            setIcon(btn, "loader");
        }

        const loadingDiv = this.outputContainer?.createDiv({ cls: "ds-loading-msg" });
        loadingDiv?.createEl("span", { cls: "ds-spinner" });
        loadingDiv?.createSpan({ text: ` ${t(this.plugin.settings.language, "running_block")}${index + 1}...` });

        const res = await this.plugin.executePython(block.code, true);

        loadingDiv?.remove();
        await this.appendOutput(res, index, fromRunAll);

        // Rafraîchissement automatique des variables
        this.refreshVariables();

        if (showNotice) {
            new Notice(t(this.plugin.settings.language, "executed_success"));
        }
        if (btn) {
            btn.removeClass('ds-is-loading');
            setIcon(btn, "play");
        }
    }

    renderConsole() {
        this.isSplit = false;
        const btnSplit = this.contentEl.querySelector('.ds-btn-split');
        if (btnSplit) btnSplit.removeClass("is-active");
        const footer = this.contentEl.querySelector('.ds-studio-footer');
        if (footer) footer.removeClass("ds-split-mode");

        this.outputContainer?.removeClass("ds-hidden");
        this.varContainer?.addClass("ds-hidden");
        this.pipContainer?.addClass("ds-hidden");
    }

    async showVariableExplorer() {
        this.isSplit = false;
        const btnSplit = this.contentEl.querySelector('.ds-btn-split');
        if (btnSplit) btnSplit.removeClass("is-active");
        const footer = this.contentEl.querySelector('.ds-studio-footer');
        if (footer) footer.removeClass("ds-split-mode");

        this.outputContainer?.addClass("ds-hidden");
        this.varContainer?.removeClass("ds-hidden");
        this.pipContainer?.addClass("ds-hidden");

        // On ne rafraîchit que si le conteneur est vide (persistance)
        if (this.varContainer && this.varContainer.innerHTML === "") {
            this.refreshVariables();
        }
    }

    async refreshVariables(force = false) {
        if (!this.varContainer) return;

        this.varContainer.empty();
        const header = this.varContainer.createEl("div", { cls: "ds-var-header" });
        header.createEl("h5", { text: t(this.plugin.settings.language, "var_explorer"), cls: "ds-var-title" });

        const actions = header.createEl("div", { cls: "ds-var-actions" });

        const btnAdd = actions.createEl("button", { text: "+", cls: "ds-btn-mini ds-btn-add-var" });
        btnAdd.setAttribute("title", t(this.plugin.settings.language, "add_var"));
        btnAdd.onclick = () => {
            // Création d'une ligne d'ajout temporaire
            const table = this.varContainer?.querySelector("table");
            if (!table) return;
            const body = table.querySelector("tbody");
            if (!body) return;

            const row = body.createEl("tr", { cls: "ds-var-row-new" });
            const tdName = row.createEl("td");
            const inputName = tdName.createEl("input", { type: "text", placeholder: t(this.plugin.settings.language, "placeholder_nom"), cls: "ds-var-input-inline" });

            const tdType = row.createEl("td");
            const selectType = tdType.createEl("select", { cls: "ds-var-select-inline" });
            ['str', 'int', 'float', 'list', 'dict', 'bool'].forEach(t => {
                const opt = selectType.createEl("option", { text: t, value: t });
            });

            const tdValue = row.createEl("td");
            const inputValue = tdValue.createEl("input", { type: "text", placeholder: t(this.plugin.settings.language, "placeholder_val"), cls: "ds-var-input-inline" });

            const tdActions = row.createEl("td");
            const btnConfirm = tdActions.createEl("button", { text: "✓", cls: "ds-btn-mini ds-btn-confirm" });
            btnConfirm.onclick = async () => {
                const name = inputName.value.trim();
                const type = selectType.value;
                let val = inputValue.value;
                if (!name) return;

                let pyCode = "";
                if (type === 'str') pyCode = `${name} = "${val.replace(/"/g, '\\"')}"`;
                else if (type === 'bool') pyCode = `${name} = ${val.toLowerCase() === 'true'}`;
                else pyCode = `${name} = ${type}(${val})`;

                await this.plugin.executePython(pyCode, false);
                this.refreshVariables(true);
                new Notice(t(this.plugin.settings.language, "var_added"));
            };
            const btnCancel = tdActions.createEl("button", { text: "×", cls: "ds-btn-mini ds-btn-cancel" });
            btnCancel.onclick = () => row.remove();

            inputName.focus();
        };

        const btnRefresh = actions.createEl("button", { text: t(this.plugin.settings.language, "refresh"), cls: "ds-btn-mini" });
        btnRefresh.onclick = () => {
            this.refreshVariables(true);
            new Notice(t(this.plugin.settings.language, "refresh_done"));
        };

        const loading = this.varContainer.createEl("div", { text: t(this.plugin.settings.language, "loading_vars"), cls: "ds-placeholder-mini" });

        const res = await this.plugin.executePython(`
import json
import sys

def get_val_str(v):
    try:
        s = str(v)
        if len(s) > 100:
            return s[:97] + "..."
        return s
    except:
        return "<err>"

vars_dict = {
    k: {
        "type": type(v).__name__,
        "value": get_val_str(v),
        "full_value": str(v) if len(str(v)) <= 1000 else str(v)[:1000]
    } 
    for k, v in globals().items() 
    if not k.startswith('_') and k not in ['sys', 'io', 'base64', 'matplotlib', 'plt', 'pd', 'sns', 'custom_show', 'vars_dict', 'micropip', 'pyodide_http', 'get_val_str', 'json', 'HAS_MATPLOTLIB', 'core_modules', 'lst', 'mod', 'pkgs', 'list_res', 'vars', 'sorted_names', 'info', 'row', 'td_name', 'input', 'new_name', 'new_val', 'py_code', 'btn_del', 'td_actions', 'btn_add', 'btn_refresh', 'loading', 'res', 'table', 'head', 'hrow', 'body', 'empty_row', 'sortedNames', 'name', 'info', 'row', 'tdName', 'input', 'newName', 'tdValue', 'newVal', 'pyCode', 'tdActions', 'btnDel']
}
print(json.dumps(vars_dict))
        `, false);

        loading.remove();

        if (res.error) {
            this.varContainer.createEl("div", { text: `${t(this.plugin.settings.language, "error_msg")}${res.error}`, cls: "ds-log-error" });
            return;
        }

        if (res.text) {
            try {
                const vars = JSON.parse(res.text);
                const table = this.varContainer.createEl("table", { cls: "ds-var-table" });
                const head = table.createEl("thead");
                const hrow = head.createEl("tr");
                hrow.createEl("th", { text: t(this.plugin.settings.language, "var_name") });
                hrow.createEl("th", { text: t(this.plugin.settings.language, "var_type") });
                hrow.createEl("th", { text: t(this.plugin.settings.language, "var_value") });
                hrow.createEl("th", { text: "" });

                const body = table.createEl("tbody");
                const sortedNames = Object.keys(vars).sort();

                if (sortedNames.length === 0) {
                    const emptyRow = body.createEl("tr");
                    emptyRow.createEl("td", { text: t(this.plugin.settings.language, "no_vars"), cls: "ds-placeholder-mini", attr: { colspan: "4" } });
                }

                for (const name of sortedNames) {
                    const info = vars[name];
                    const row = body.createEl("tr");

                    // NOM (Editable)
                    const tdName = row.createEl("td", { text: name, cls: "ds-var-name ds-editable" });
                    tdName.ondblclick = () => {
                        const input = tdName.createEl("input", { type: "text", value: name, cls: "ds-var-input-inline" });
                        tdName.firstChild?.remove();
                        input.focus();
                        input.onkeydown = async (e) => {
                            if (e.key === 'Enter') {
                                const newName = input.value.trim();
                                if (newName && newName !== name) {
                                    await this.plugin.executePython(`${newName} = ${name}\ndel ${name}`, false);
                                    this.refreshVariables(true);
                                } else {
                                    this.refreshVariables(true);
                                }
                            } else if (e.key === 'Escape') {
                                this.refreshVariables(true);
                            }
                        };
                        input.onblur = () => this.refreshVariables(true);
                    };

                    // TYPE
                    row.createEl("td", { text: info.type, cls: "ds-var-type" });

                    // VALEUR (Editable)
                    const tdValue = row.createEl("td", { text: info.value, cls: "ds-var-value ds-editable" });
                    tdValue.setAttribute("title", t(this.plugin.settings.language, "double_click_edit"));
                    tdValue.ondblclick = () => {
                        const input = tdValue.createEl("input", { type: "text", value: info.full_value, cls: "ds-var-input-inline" });
                        tdValue.firstChild?.remove();
                        input.focus();
                        input.onkeydown = async (e) => {
                            if (e.key === 'Enter') {
                                let newVal = input.value;
                                let pyCode = "";
                                if (info.type === 'str') pyCode = `${name} = "${newVal.replace(/"/g, '\\"')}"`;
                                else if (info.type === 'bool') pyCode = `${name} = ${newVal.toLowerCase() === 'true'}`;
                                else pyCode = `${name} = ${info.type}(${newVal})`;

                                await this.plugin.executePython(pyCode, false);
                                this.refreshVariables(true);
                            } else if (e.key === 'Escape') {
                                this.refreshVariables(true);
                            }
                        };
                        input.onblur = () => this.refreshVariables(true);
                    };

                    // ACTIONS (Delete)
                    const tdActions = row.createEl("td", { cls: "ds-var-actions-cell" });
                    const btnDel = tdActions.createEl("button", { text: "×", cls: "ds-btn-mini ds-btn-del-var" });
                    btnDel.onclick = async () => {
                        await this.plugin.executePython(`del ${name}`, false);
                        this.refreshVariables(true);
                    };
                }
            } catch (e) {
                this.varContainer.createEl("div", { text: t(this.plugin.settings.language, "err_read_vars"), cls: "ds-log-error" });
            }
        }
    }

    async showPackageManager() {
        this.isSplit = false;
        const btnSplit = this.contentEl.querySelector('.ds-btn-split');
        if (btnSplit) btnSplit.removeClass("is-active");
        const footer = this.contentEl.querySelector('.ds-studio-footer');
        if (footer) footer.removeClass("ds-split-mode");

        this.outputContainer?.addClass("ds-hidden");
        this.varContainer?.addClass("ds-hidden");
        this.pipContainer?.removeClass("ds-hidden");

        if (this.pipContainer && this.pipContainer.innerHTML === "") {
            this.refreshPackages();
        }
    }

    async refreshPackages() {
        if (!this.pipContainer) return;
        this.pipContainer.empty();

        const header = this.pipContainer.createEl("div", { cls: "ds-var-header" });
        header.createEl("h5", { text: t(this.plugin.settings.language, "pkg_manager"), cls: "ds-var-title" });

        const btnRefresh = header.createEl("button", { text: t(this.plugin.settings.language, "refresh"), cls: "ds-btn-mini" });
        btnRefresh.onclick = () => this.refreshPackages();

        // --- SECTION: INSTALLATION ---
        const installSection = this.pipContainer.createEl("div", { cls: "ds-pip-install-section" });
        const inputRow = installSection.createEl("div", { cls: "ds-pip-input-row" });
        const input = inputRow.createEl("input", { type: "text", placeholder: t(this.plugin.settings.language, "pkg_name_placeholder") });
        const btnInstall = inputRow.createEl("button", { text: t(this.plugin.settings.language, "install"), cls: "ds-btn-mini" });

        const statusArea = installSection.createEl("div", { cls: "ds-pip-status" });

        btnInstall.onclick = async () => {
            const pkgName = input.value.trim();
            if (!pkgName) return;
            statusArea.empty();
            statusArea.createEl("div", { text: `${t(this.plugin.settings.language, "installing")}${pkgName}...`, cls: "ds-loading-msg" });

            const res = await this.plugin.executePython(`
import micropip
try:
    await micropip.install("${pkgName}")
    print(f"✅ ${pkgName} ${t(this.plugin.settings.language, "install_success_msg")}")
except Exception as e:
    print(f"❌ Erreur: {str(e)}")
            `, false);

            statusArea.empty();
            statusArea.createEl("pre", { text: res.text, cls: "ds-log-text" });

            if (res.text?.includes("✅")) {
                if (!this.plugin.settings.requestedPackages.includes(pkgName)) {
                    this.plugin.settings.requestedPackages.push(pkgName);
                    await this.plugin.saveSettings();
                }
                new Notice(t(this.plugin.settings.language, "pkg_installed"));
                setTimeout(() => this.refreshPackages(), 1500);
            }
        };

        // --- SECTION: PAQUETS MÉMORISÉS ---
        const memSection = this.pipContainer.createEl("div", { cls: "ds-pip-mem-section" });
        memSection.createEl("h6", { text: t(this.plugin.settings.language, "memorized_pkgs"), cls: "ds-pip-subtitle" });

        if (this.plugin.settings.requestedPackages.length === 0) {
            memSection.createEl("div", { text: t(this.plugin.settings.language, "no_memorized"), cls: "ds-placeholder-mini" });
        } else {
            const memList = memSection.createEl("div", { cls: "ds-pip-tag-list" });
            this.plugin.settings.requestedPackages.forEach(pkg => {
                const tag = memList.createEl("span", { cls: "ds-pip-tag" });
                tag.createSpan({ text: pkg });
                const delBtn = tag.createEl("span", { cls: "ds-pip-tag-del", text: "×" });
                delBtn.onclick = async () => {
                    const pkgToRemove = pkg;
                    // Actual uninstallation from Pyodide environment
                    await this.plugin.executePython(`
import sys
import os
import shutil
import micropip

pkg_name = "${pkgToRemove}".replace("-", "_")
# 1. Remove from sys.modules
for mod in list(sys.modules.keys()):
    if mod == pkg_name or mod.startswith(pkg_name + "."):
        del sys.modules[mod]

# 2. Remove from site-packages
site_pkgs = "/lib/python3.11/site-packages"
if os.path.exists(site_pkgs):
    for item in os.listdir(site_pkgs):
        if item.startswith(pkg_name):
            path = os.path.join(site_pkgs, item)
            if os.path.isdir(path): shutil.rmtree(path)
            else: os.remove(path)

# 3. Remove from micropip's internal registry
try:
    mgr = getattr(micropip, 'PACKAGE_MANAGER', getattr(micropip, '_package_manager', None))
    if mgr and hasattr(mgr, 'installed_packages'):
        if pkg_name in mgr.installed_packages:
            del mgr.installed_packages[pkg_name]
        if "${pkgToRemove}" in mgr.installed_packages:
            del mgr.installed_packages["${pkgToRemove}"]
except:
    pass
`, false);

                    this.plugin.settings.requestedPackages = this.plugin.settings.requestedPackages.filter(p => p !== pkg);
                    await this.plugin.saveSettings();
                    this.refreshPackages();
                    new Notice(t(this.plugin.settings.language, "pkg_deleted"));
                };
            });
        }

        // --- SECTION: ENVIRONNEMENT ACTIF ---
        const envSection = this.pipContainer.createEl("div", { cls: "ds-pip-env-section" });
        envSection.createEl("h6", { text: t(this.plugin.settings.language, "active_env"), cls: "ds-pip-subtitle" });

        const loading = envSection.createEl("div", { text: t(this.plugin.settings.language, "loading_pkgs"), cls: "ds-placeholder-mini" });

        const listRes = await this.plugin.executePython(`
import micropip
import json
import sys

# On récupère les paquets installés via micropip de manière robuste
def __pd_get_pkgs():
    import micropip
    import json
    import sys
    try:
        # Format récent: micropip.list() est un dictionnaire ou PackageDict
        lst = micropip.list()
        if hasattr(lst, 'items'):
            pkgs = {name: getattr(info, 'version', 'unknown') for name, info in lst.items()}
        elif hasattr(lst, 'list'):
            pkgs = {p.name: p.version for p in lst.list}
        else:
            pkgs = {getattr(p, 'name', str(p)): getattr(p, 'version', 'unknown') for p in lst}
    except Exception as e:
        pkgs = {"error": str(e)}

    # On ajoute les modules déjà chargés dans sys.modules qui sont des paquets majeurs
    core_modules = ['numpy', 'pandas', 'matplotlib', 'sklearn', 'seaborn', 'scipy']
    for mod in core_modules:
        if mod in sys.modules:
            try:
                m = sys.modules[mod]
                ver = getattr(m, '__version__', 'loaded')
                if mod not in pkgs:
                    pkgs[mod] = ver
            except:
                pass
    return pkgs

print(json.dumps(__pd_get_pkgs()))
        `, false);

        loading.remove();

        if (listRes.text) {
            try {
                const pkgs = JSON.parse(listRes.text);
                const table = envSection.createEl("table", { cls: "ds-var-table" });
                const head = table.createEl("thead");
                const hrow = head.createEl("tr");
                hrow.createEl("th", { text: t(this.plugin.settings.language, "pkg") });
                hrow.createEl("th", { text: t(this.plugin.settings.language, "version") });

                const body = table.createEl("tbody");
                const sortedNames = Object.keys(pkgs).sort();
                for (const name of sortedNames) {
                    const row = body.createEl("tr");
                    row.createEl("td", { text: name, cls: "ds-var-name" });
                    row.createEl("td", { text: pkgs[name] as string, cls: "ds-var-type" });
                }
            } catch (e) {
                envSection.createEl("div", { text: t(this.plugin.settings.language, "err_read_pkgs"), cls: "ds-log-error" });
            }
        }
    }
}

// --- 2. Widgets (Boutons Centrés) ---
class RunButtonWidget extends WidgetType {
    constructor(private plugin: PyDataPlugin, private code: string, private endLineNum: number) { super(); }

    toDOM(view: EditorView): HTMLElement {
        const container = document.createElement("div");
        container.className = "py-btn-container"; // Centré via CSS

        const btnInline = container.createEl("button", { cls: "py-run-btn" });
        const iconSpan = btnInline.createSpan({ cls: "py-btn-icon" });
        setIcon(iconSpan, "play");
        btnInline.createSpan({ text: t(this.plugin.settings.language, "run") });

        btnInline.onclick = async (e) => {
            e.preventDefault();
            btnInline.addClass('ds-is-loading');
            setIcon(iconSpan, "loader");
            const res = await this.plugin.executePython(this.code, true);
            this.plugin.writeOutputToMarkdown(view, this.endLineNum, res);
            if (this.plugin.view) this.plugin.view.refreshVariables();
            btnInline.removeClass('ds-is-loading');
            setIcon(iconSpan, "play");
            new Notice(t(this.plugin.settings.language, "executed_success"));
        };

        const btnStudio = container.createEl("button", { cls: "py-studio-btn" });
        const studioIconSpan = btnStudio.createSpan({ cls: "py-btn-icon" });
        setIcon(studioIconSpan, "layout-sidebar-right");
        btnStudio.createSpan({ text: t(this.plugin.settings.language, "studio") });
        btnStudio.onclick = (e) => {
            e.preventDefault();
            this.plugin.activateView();
            if (this.plugin.view) {
                this.plugin.view.addBlock(this.code);
                new Notice(t(this.plugin.settings.language, "added_to_studio"));
            }
        };

        return container;
    }
}

// --- 2.1 Modal pour sauvegarder l'image ---
class ImageSaveModal extends Modal {
    result: { fileName: string, folderPath: string } | null = null;
    onSubmit: (result: { fileName: string, folderPath: string }) => void;

    constructor(app: App, private plugin: PyDataPlugin, private defaultFileName: string, private defaultFolder: string, onSubmit: (result: { fileName: string, folderPath: string }) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: t(this.plugin.settings.language, "modal_save_image_title") });
        contentEl.createEl("p", { text: t(this.plugin.settings.language, "modal_save_image_desc") });

        let fileName = this.defaultFileName;
        let folderPath = this.defaultFolder;

        new Setting(contentEl)
            .setName(t(this.plugin.settings.language, "var_name"))
            .addText(text => text
                .setPlaceholder(t(this.plugin.settings.language, "modal_filename_placeholder"))
                .setValue(fileName)
                .onChange(value => fileName = value));

        new Setting(contentEl)
            .setName(t(this.plugin.settings.language, "settings_image_folder"))
            .setDesc(t(this.plugin.settings.language, "settings_image_folder_desc"))
            .addText(text => {
                text.setValue(folderPath)
                    .onChange(value => folderPath = value);
                new FolderSuggest(this.app, text.inputEl);
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(t(this.plugin.settings.language, "confirm"))
                .setCta()
                .onClick(() => {
                    this.close();
                    this.onSubmit({ fileName, folderPath });
                }))
            .addButton(btn => btn
                .setButtonText(t(this.plugin.settings.language, "cancel"))
                .onClick(() => this.close()));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// --- 2.2 Suggestion de dossiers ---
class FolderSuggest extends AbstractInputSuggest<TFolder> {
    private inputEl: HTMLInputElement;

    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.inputEl = inputEl;
    }

    getSuggestions(inputStr: string): TFolder[] {
        const abstractFiles = this.app.vault.getAllLoadedFiles();
        const folders: TFolder[] = [];
        const lowerCaseInputStr = inputStr.toLowerCase();

        abstractFiles.forEach((file) => {
            if (file instanceof TFolder && file.path.toLowerCase().includes(lowerCaseInputStr)) {
                folders.push(file);
            }
        });

        return folders;
    }

    renderSuggestion(file: TFolder, el: HTMLElement): void {
        el.setText(file.path);
    }

    selectSuggestion(file: TFolder): void {
        this.inputEl.value = file.path;
        this.inputEl.trigger("input");
        this.close();
    }
}

const codeBlockButtonPlugin = (plugin: PyDataPlugin) => ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = this.buildDecorations(view); }
    update(update: ViewUpdate) { if (update.docChanged || update.viewportChanged) this.decorations = this.buildDecorations(update.view); }

    buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        for (let i = 1; i <= view.state.doc.lines; i++) {
            const line = view.state.doc.line(i);
            if (line.text.trim().startsWith('```python')) {
                const endLine = this.findEndLine(view.state.doc, i);
                const code = view.state.doc.sliceString(line.from + 9, view.state.doc.line(endLine).from);
                builder.add(line.from, line.from, Decoration.widget({
                    widget: new RunButtonWidget(plugin, code, endLine), side: 1
                }));
            }
        }
        return builder.finish();
    }
    findEndLine(doc: any, start: number) {
        for (let j = start + 1; j <= doc.lines; j++) { if (doc.line(j).text.trim().startsWith('```')) return j; }
        return start;
    }
}, { decorations: v => v.decorations });

// --- 3. Plugin Principal ---
export default class PyDataPlugin extends Plugin {
    pyodide: any = null;
    pyodideReady: boolean = false;
    isInitializing: Promise<void> | null = null;
    view: DataStudioView | null = null;
    settings: PyDataSettings;

    async onload() {
        await this.loadSettings();
        this.registerView(VIEW_TYPE_DATA_STUDIO, (leaf) => (this.view = new DataStudioView(leaf, this)));
        this.addRibbonIcon('activity', 'Python Data Studio', () => this.activateView());
        this.addSettingTab(new PyDataSettingTab(this.app, this));
        this.registerEditorExtension(codeBlockButtonPlugin(this));

        // Reading Mode Support
        this.registerMarkdownPostProcessor((el, ctx) => {
            const codeblocks = el.querySelectorAll("code.language-python");
            codeblocks.forEach((codeElement) => {
                const pre = codeElement.parentElement;
                if (!pre) return;

                const container = document.createElement("div");
                container.className = "py-btn-container py-reading-mode";

                // Create a wrapper for the pre element to handle positioning and hover
                const wrapper = document.createElement("div");
                wrapper.className = "py-code-wrapper";
                wrapper.style.position = "relative";

                if (pre.parentElement) {
                    pre.parentElement.insertBefore(wrapper, pre);
                    wrapper.appendChild(pre);
                    wrapper.appendChild(container);
                } else {
                    // Fallback if pre has no parent (unlikely)
                    pre.appendChild(container);
                }

                const btnRun = container.createEl("button", { cls: "py-run-btn" });
                const iconSpan = btnRun.createSpan({ cls: "py-btn-icon" });
                setIcon(iconSpan, "play");
                btnRun.createSpan({ text: t(this.settings.language, "run") });

                btnRun.onclick = async (e) => {
                    e.preventDefault();
                    setIcon(iconSpan, "loader");
                    const code = codeElement.textContent || "";
                    const res = await this.executePython(code, true);

                    // Handle Output in Reading Mode
                    // Try to get section info from multiple possible elements
                    let sectionInfo = ctx.getSectionInfo(pre);
                    if (!sectionInfo) sectionInfo = ctx.getSectionInfo(codeElement as HTMLElement);
                    if (!sectionInfo && pre.parentElement) sectionInfo = ctx.getSectionInfo(pre.parentElement);
                    if (!sectionInfo && wrapper) sectionInfo = ctx.getSectionInfo(wrapper);

                    if (sectionInfo) {
                        console.log("PyData: Found section info", sectionInfo);
                        // We have line numbers, we can modify the file
                        await this.writeOutputToMarkdownFile(ctx.sourcePath, sectionInfo.lineEnd, res);
                    } else {
                        // Fallback: if we can't get section info, try to append to the end of the active file
                        // but only if it's the right file. This is a last resort.
                        const activeFile = this.app.workspace.getActiveFile();
                        console.warn("PyData: getSectionInfo returned null. Active file:", activeFile?.path, "Source path:", ctx.sourcePath);

                        if (activeFile && (activeFile.path === ctx.sourcePath || !ctx.sourcePath)) {
                            // If we don't have line numbers, we can't replace accurately, 
                            // so we just notify the user.
                            new Notice(t(this.settings.language, "reading_mode_err"));
                        } else {
                            new Notice(t(this.settings.language, "reading_mode_no_insert"));
                        }
                    }

                    if (this.view) this.view.refreshVariables();
                    setIcon(iconSpan, "play");
                    new Notice(t(this.settings.language, "executed_success"));
                };

                const btnStudio = container.createEl("button", { cls: "py-studio-btn" });
                const studioIconSpan = btnStudio.createSpan({ cls: "py-btn-icon" });
                setIcon(studioIconSpan, "layout-sidebar-right");
                btnStudio.createSpan({ text: t(this.settings.language, "studio") });

                btnStudio.onclick = (e) => {
                    e.preventDefault();
                    this.activateView();
                    if (this.view) {
                        this.view.addBlock(codeElement.textContent || "");
                        new Notice(t(this.settings.language, "added_to_studio"));
                    }
                };
            });
        });

        this.app.workspace.onLayoutReady(() => this.initPyodide());

        this.registerEvent(
            this.app.workspace.on("editor-drop", async (evt: DragEvent, editor: Editor, info: MarkdownView) => {
                const rawData = evt.dataTransfer?.getData("application/x-obsidian-pydata-result");
                if (rawData) {
                    evt.preventDefault();
                    try {
                        const result = JSON.parse(rawData);
                        let markdown = `\n> [!abstract] ${t(this.settings.language, "result_python")}\n`;
                        if (result.error) {
                            markdown = `\n> [!error] ${t(this.settings.language, "error_python")}\n`;
                            result.error.split('\n').forEach((line: string) => markdown += `> ${line}\n`);
                        } else {
                            if (result.text) {
                                markdown += `> \`\`\`text\n`;
                                result.text.split('\n').forEach((line: string) => markdown += `> ${line}\n`);
                                markdown += `> \`\`\`\n`;
                            }
                            if (result.image) {
                                const imageLink = await this.processImage(result.image, info.file ? info.file.path : "");
                                if (imageLink.startsWith('![')) {
                                    markdown += `> ${imageLink}\n`;
                                } else {
                                    markdown += `> ![Graph](${imageLink})\n`;
                                }
                            }
                        }
                        editor.replaceSelection(markdown + "\n");
                    } catch (e) {
                        console.error("PyData: Error parsing drop data", e);
                    }
                }
            })
        );
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_DATA_STUDIO);
        if (leaves.length > 0) {
            leaf = leaves[0];
            if (leaf.view instanceof DataStudioView) this.view = leaf.view;
        } else {
            leaf = workspace.getRightLeaf(false);
            await leaf.setViewState({ type: VIEW_TYPE_DATA_STUDIO, active: true });
            if (leaf.view instanceof DataStudioView) this.view = leaf.view;
        }
        workspace.revealLeaf(leaf);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async withNodeGlobalsHidden(fn: () => Promise<any>) {
        const win = window as any;
        const saved = { p: win.process, r: win.require, m: win.module };
        try {
            win.process = undefined; win.require = undefined; win.module = undefined;
            return await fn();
        } finally {
            if (saved.p) win.process = saved.p;
            if (saved.r) win.require = saved.r;
            if (saved.m) win.module = saved.m;
        }
    }

    async initPyodide(showNotice = false) {
        if (this.pyodideReady) return;

        if (this.isInitializing) {
            return this.isInitializing;
        }

        this.isInitializing = (async () => {
            try {
                await this.withNodeGlobalsHidden(async () => {
                    if (!window.loadPyodide) {
                        const script = document.createElement('script');
                        script.src = `${PYODIDE_BASE}pyodide.js`;
                        document.head.appendChild(script);
                        await new Promise(r => script.onload = r);
                    }
                    // @ts-ignore
                    this.pyodide = await window.loadPyodide({ indexURL: PYODIDE_BASE });
                    await this.pyodide.loadPackage(['numpy', 'pandas', 'matplotlib', 'scikit-learn', 'micropip', 'pyodide-http']);
                    await this.pyodide.runPythonAsync(`
                        import micropip
                        try: await micropip.install("seaborn")
                        except: pass
                        import pyodide_http
                        pyodide_http.patch_all()
                    `);

                    // Auto-load packages (Session + Autoload)
                    const allPkgs = [...new Set([...this.settings.requestedPackages, ...this.settings.autoloadPackages])];
                    if (allPkgs.length > 0) {
                        const pkgsStr = allPkgs.join('", "');
                        await this.pyodide.runPythonAsync(`
                            import micropip
                            try:
                                await micropip.install(["${pkgsStr}"])
                            except Exception as e:
                                print(f"Error auto-loading packages: {str(e)}")
                        `);
                    }
                });
                this.pyodideReady = true;
                new Notice(t(this.settings.language, "python_ready"));
                setTimeout(() => {
                    new Notice(t(this.settings.language, "first_run_warning"), 6000);
                }, 1000);
            } catch (e) {
                console.error(e);
                this.isInitializing = null;
            }
        })();

        return this.isInitializing;
    }

    resetPyodide() {
        this.pyodide = null;
        this.pyodideReady = false;
        this.isInitializing = null;
    }

    async executePython(code: string, wrap = true): Promise<{ text: string, image: string | null, error?: string }> {
        if (!this.pyodideReady) { await this.initPyodide(true); }

        try {
            let stdout = "";
            let stderr = "";
            this.pyodide.setStdout({ batched: (str: string) => stdout += str + "\n" });
            this.pyodide.setStderr({ batched: (str: string) => stderr += str + "\n" });

            let finalCode = code;
            if (wrap) {
                finalCode = `
import io, base64, sys
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import pandas as pd
    import seaborn as sns
    __pd_has_matplotlib = True
except ImportError:
    __pd_has_matplotlib = False

if __pd_has_matplotlib:
    plt.clf()

def __pd_custom_show():
    if not __pd_has_matplotlib: return
    fig = plt.gcf()
    if fig.get_axes():
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=100, bbox_inches='tight', facecolor='white')
        buf.seek(0)
        print(f'__PLOT_DATA__:{base64.b64encode(buf.read()).decode("UTF-8")}')
    plt.close('all')

if __pd_has_matplotlib:
    plt.show = __pd_custom_show

${code}

if __pd_has_matplotlib:
    __pd_custom_show()
`;
            }

            await this.pyodide.runPythonAsync(finalCode);

            const plotMatch = stdout.match(/__PLOT_DATA__:([A-Za-z0-9+/=]+)/);
            const cleanStdout = stdout.replace(/__PLOT_DATA__:[A-Za-z0-9+/=]+\n?/, '').trim();
            let err = stderr ? stderr : undefined;
            if (err && err.includes("ModuleNotFoundError")) {
                const match = err.match(/ModuleNotFoundError: (?:The module )?'([^']+)'/);
                if (match) {
                    const moduleName = match[1];
                    const helpfulMsg = `\n\n💡 ${t(this.settings.language, "err_module_not_found").replace("{0}", moduleName)}\n${t(this.settings.language, "suggest_install_manual")}`;
                    err += helpfulMsg;
                }
            }
            return { text: cleanStdout, image: plotMatch ? plotMatch[1] : null, error: err };

        } catch (e: any) {
            console.error("PyData: Python execution error", e);
            return { text: "", image: null, error: e.toString() };
        }
    }

    // --- INSÉRER RÉSULTAT DU STUDIO AU CURSEUR ---
    async insertLogToCursor(res: { text: string, image: string | null, error?: string }) {
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView) {
            new Notice(t(this.settings.language, "click_note"));
            return;
        }

        let block = `\n> [!abstract] ${t(this.settings.language, "result_python")}\n`;
        if (res.error) {
            block = `\n> [!error] ${t(this.settings.language, "error_python")}\n`;
            res.error.split('\n').forEach(line => block += `> ${line}\n`);
        } else {
            if (res.text) {
                block += `> \`\`\`text\n`;
                res.text.split('\n').forEach(line => block += `> ${line}\n`);
                block += `> \`\`\`\n`;
            }
            if (res.image) {
                const imageLink = await this.processImage(res.image, "");
                if (imageLink.startsWith('![')) {
                    block += `> ${imageLink}\n`;
                } else {
                    block += `> ![Graph](${imageLink})\n`;
                }
            }
        }

        markdownView.editor.replaceSelection(block);
        new Notice(t(this.settings.language, "inserted"));
    }

    // --- REMPLACEMENT INTELLIGENT (INLINE) ---
    async writeOutputToMarkdown(view: EditorView, endLineNum: number, res: { text: string, image: string | null, error?: string }) {
        // 1. Construction du nouveau bloc de résultat avec Callouts
        let resultBlock = `> [!abstract] ${t(this.settings.language, "result_python")}\n`;
        if (res.error) {
            resultBlock = `> [!error] ${t(this.settings.language, "error_python")}\n`;
            res.error.split('\n').forEach(line => resultBlock += `> ${line}\n`);
        } else {
            if (res.text) {
                resultBlock += `> \`\`\`text\n`;
                res.text.split('\n').forEach(line => resultBlock += `> ${line}\n`);
                resultBlock += `> \`\`\`\n`;
            }
            if (res.image) {
                const activeFile = this.app.workspace.getActiveFile();
                const imageLink = await this.processImage(res.image, activeFile ? activeFile.path : "");
                if (imageLink.startsWith('![')) {
                    resultBlock += `> ${imageLink}\n`;
                } else {
                    resultBlock += `> ![Graph](${imageLink})\n`;
                }
            }
            if (!res.text && !res.image) {
                resultBlock += `> (${t(this.settings.language, "executed_no_output")})\n`;
            }
        }

        const doc = view.state.doc;
        const line = doc.line(endLineNum);
        let insertPos = line.to;
        let replaceEndPos = line.to;

        // 2. Détection d'un bloc existant pour le remplacer
        let foundExisting = false;
        let scanLimit = Math.min(endLineNum + 3, doc.lines);

        const resultTitles = Object.values(TRANSLATIONS).map(t => t.result_python);
        const errorTitles = Object.values(TRANSLATIONS).map(t => t.error_python);

        for (let i = endLineNum + 1; i <= scanLimit; i++) {
            const l = doc.line(i);
            const text = l.text.trim();

            const isResult = resultTitles.some(title => text.startsWith(`> [!abstract] ${title}`));
            const isError = errorTitles.some(title => text.startsWith(`> [!error] ${title}`));

            if (isResult || isError) {
                foundExisting = true;
                // On remplace à partir de la ligne elle-même
                insertPos = l.from;

                // On cherche la fin du bloc
                replaceEndPos = l.to;
                for (let j = i + 1; j <= doc.lines; j++) {
                    const nextL = doc.line(j);
                    const nextText = nextL.text.trim();
                    if (nextText.startsWith('>') || (nextText === '' && j < doc.lines && doc.line(j + 1).text.trim().startsWith('>'))) {
                        // On inclut la ligne dans la plage de remplacement
                        // Si ce n'est pas la dernière ligne, on inclut aussi le caractère de saut de ligne
                        replaceEndPos = (j < doc.lines) ? doc.line(j + 1).from : nextL.to;
                    } else {
                        break;
                    }
                }
                break;
            } else if (text !== '' && !text.startsWith('>')) {
                break;
            }
        }

        // Si on n'a pas trouvé d'existant, on ajoute un saut de ligne avant
        if (!foundExisting) {
            resultBlock = `\n\n` + resultBlock;
        } else {
            // Si on remplace, on s'assure de finir par un saut de ligne car on a probablement mangé celui d'origine
            resultBlock = resultBlock;
        }

        // 3. Application de la modification
        view.dispatch({
            changes: {
                from: insertPos,
                to: replaceEndPos,
                insert: resultBlock
            }
        });
    }

    // --- ECRITURE FICHIER (MODE LECTURE) ---
    async writeOutputToMarkdownFile(filePath: string, endLineNum: number, res: { text: string, image: string | null, error?: string }) {
        let file = this.app.vault.getAbstractFileByPath(filePath);

        // Fallback to active file if path is missing or file not found
        if (!file || !(file instanceof TFile)) {
            file = this.app.workspace.getActiveFile();
        }

        if (!file || !(file instanceof TFile)) {
            console.error("PyData: Could not find file to write output", filePath);
            return;
        }

        try {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');

            // 1. Construction du nouveau bloc
            let resultBlock = `> [!abstract] ${t(this.settings.language, "result_python")}\n`;
            if (res.error) {
                resultBlock = `> [!error] ${t(this.settings.language, "error_python")}\n`;
                res.error.split('\n').forEach(line => resultBlock += `> ${line}\n`);
            } else {
                if (res.text) {
                    resultBlock += `> \`\`\`text\n`;
                    res.text.split('\n').forEach(line => resultBlock += `> ${line}\n`);
                    resultBlock += `> \`\`\`\n`;
                }
                if (res.image) {
                    const imageLink = await this.processImage(res.image, filePath);
                    if (imageLink.startsWith('![')) {
                        resultBlock += `> ${imageLink}\n`;
                    } else {
                        resultBlock += `> ![Graph](${imageLink})\n`;
                    }
                }
                if (!res.text && !res.image) {
                    resultBlock += `> (${t(this.settings.language, "executed_no_output")})\n`;
                }
            }

            // 2. Détection existant
            let insertIndex = endLineNum + 1;
            let removeCount = 0;

            const resultTitles = Object.values(TRANSLATIONS).map(t => t.result_python);
            const errorTitles = Object.values(TRANSLATIONS).map(t => t.error_python);

            // Scan ahead to find an existing result block, skipping empty lines
            let foundIndex = -1;
            for (let i = insertIndex; i < Math.min(insertIndex + 3, lines.length); i++) {
                const line = lines[i].trim();
                if (line === "") continue;

                const isResult = resultTitles.some(title => line.startsWith(`> [!abstract] ${title}`));
                const isError = errorTitles.some(title => line.startsWith(`> [!error] ${title}`));

                if (isResult || isError) {
                    foundIndex = i;
                    break;
                } else {
                    // If we hit something else that's not empty, stop looking
                    break;
                }
            }

            if (foundIndex !== -1) {
                insertIndex = foundIndex;
                removeCount = 1;
                for (let i = insertIndex + 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line.startsWith('>') || (line === '' && i + 1 < lines.length && lines[i + 1].trim().startsWith('>'))) {
                        removeCount++;
                    } else {
                        break;
                    }
                }
            }

            // 3. Modification
            if (removeCount === 0) {
                // Inserting new - add a blank line before if not already there
                if (insertIndex < lines.length && lines[insertIndex].trim() !== "") {
                    lines.splice(insertIndex, 0, "", ...resultBlock.trim().split('\n'));
                } else {
                    lines.splice(insertIndex, 0, ...resultBlock.trim().split('\n'));
                }
            } else {
                // Replacing
                lines.splice(insertIndex, removeCount, ...resultBlock.trim().split('\n'));
            }

            await this.app.vault.modify(file, lines.join('\n'));
            new Notice(t(this.settings.language, "inserted_in_file"));
            console.log("PyData: Successfully modified file", file.path, "at line", insertIndex);
        } catch (err) {
            console.error("PyData: Error modifying file", err);
            new Notice(t(this.settings.language, "error_writing_file"));
        }
    }

    async saveImageToVault(base64Data: string, fileName: string, folderPath: string): Promise<string> {
        const binaryData = Buffer.from(base64Data, 'base64');
        const arrayBuffer = binaryData.buffer.slice(binaryData.byteOffset, binaryData.byteOffset + binaryData.byteLength);
        const path = normalizePath(`${folderPath}/${fileName}`);

        // Ensure folder exists
        const folderParts = folderPath.split('/');
        let currentPath = "";
        for (const part of folderParts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            if (!this.app.vault.getAbstractFileByPath(currentPath)) {
                await this.app.vault.createFolder(currentPath);
            }
        }

        // Handle filename conflicts
        let finalPath = path;
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(finalPath)) {
            const extIndex = path.lastIndexOf('.');
            const base = path.substring(0, extIndex);
            const ext = path.substring(extIndex);
            finalPath = `${base}_${counter}${ext}`;
            counter++;
        }

        const file = await this.app.vault.createBinary(finalPath, arrayBuffer);
        new Notice(t(this.settings.language, "image_saved") + file.name);
        return this.app.metadataCache.fileToLinktext(file, "", true);
    }

    async processImage(base64Data: string, sourcePath: string): Promise<string> {
        const mode = this.settings.imageSaveMode;
        if (mode === 'base64') {
            return `data:image/png;base64,${base64Data}`;
        }

        let folderPath = "";
        if (mode === 'root') {
            const file = this.app.vault.getAbstractFileByPath(sourcePath);
            if (file && file.parent) {
                folderPath = file.parent.path;
            }
        } else if (mode === 'folder') {
            folderPath = this.settings.imageFolderPath;
        }

        const timestamp = new Date().getTime();
        const defaultFileName = `plot_${timestamp}.png`;

        if (mode === 'ask') {
            return new Promise((resolve) => {
                new ImageSaveModal(this.app, this, defaultFileName, this.settings.imageFolderPath || "", async (result) => {
                    const link = await this.saveImageToVault(base64Data, result.fileName, result.folderPath);
                    resolve(`![[${link}]]`);
                }).open();
            });
        }

        const link = await this.saveImageToVault(base64Data, defaultFileName, folderPath);
        return `![[${link}]]`;
    }
}

class PyDataSettingTab extends PluginSettingTab {
    plugin: PyDataPlugin;

    constructor(app: App, plugin: PyDataPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Language')
            .setDesc('Choose the language for the plugin interface.')
            .addDropdown(dropdown => dropdown
                .addOption('en', 'English')
                .addOption('fr', 'Français')
                .addOption('es', 'Español')
                .addOption('de', 'Deutsch')
                .addOption('it', 'Italiano')
                .setValue(this.plugin.settings.language)
                .onChange(async (value) => {
                    this.plugin.settings.language = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh to update labels
                }));

        new Setting(containerEl)
            .setName(t(this.plugin.settings.language, "settings_image_save_mode"))
            .setDesc(t(this.plugin.settings.language, "settings_image_save_mode_desc"))
            .addDropdown(dropdown => dropdown
                .addOption('base64', t(this.plugin.settings.language, "mode_base64"))
                .addOption('folder', t(this.plugin.settings.language, "mode_folder"))
                .addOption('root', t(this.plugin.settings.language, "mode_root"))
                .addOption('ask', t(this.plugin.settings.language, "mode_ask"))
                .setValue(this.plugin.settings.imageSaveMode)
                .onChange(async (value: 'base64' | 'folder' | 'root' | 'ask') => {
                    this.plugin.settings.imageSaveMode = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh to show/hide folder path setting
                }));
        if (this.plugin.settings.imageSaveMode === 'folder') {
            new Setting(containerEl)
                .setName(t(this.plugin.settings.language, "settings_image_folder"))
                .setDesc(t(this.plugin.settings.language, "settings_image_folder_desc"))
                .addText(text => {
                    text.setPlaceholder(t(this.plugin.settings.language, "settings_image_folder"))
                        .setValue(this.plugin.settings.imageFolderPath)
                        .onChange(async (value) => {
                            this.plugin.settings.imageFolderPath = value;
                            await this.plugin.saveSettings();
                        });
                    new FolderSuggest(this.app, text.inputEl);
                });
        }

        // --- SECTION: AUTOLOAD PACKAGES ---
        containerEl.createEl("hr");
        const autoloadHeader = containerEl.createEl("div", { cls: "ds-pip-mem-section" });
        autoloadHeader.createEl("h3", { text: t(this.plugin.settings.language, "autoload_pkgs") });

        // Uninstallation Warning
        const warningBox = containerEl.createEl("div", { cls: "ds-log-entry", attr: { style: "background: rgba(255, 159, 67, 0.05); border-left: 4px solid #ff9f43; margin-bottom: 10px; cursor: default;" } });
        warningBox.createEl("div", { text: t(this.plugin.settings.language, "uninstallation_warning"), attr: { style: "font-size: 0.9em; line-height: 1.4;" } });

        autoloadHeader.createEl("p", { text: t(this.plugin.settings.language, "autoload_pkgs_desc"), cls: "setting-item-description" });

        // Explanatory message
        const infoBox = containerEl.createEl("div", { cls: "ds-log-entry", attr: { style: "background: rgba(125, 95, 255, 0.05); border-left: 4px solid var(--pydata-accent); margin-bottom: 20px; cursor: default;" } });
        infoBox.createEl("div", { text: "💡 " + t(this.plugin.settings.language, "autoload_explanation"), attr: { style: "font-size: 0.9em; line-height: 1.4;" } });

        const installSection = containerEl.createEl("div", { cls: "ds-pip-install-section" });
        const inputRow = installSection.createEl("div", { cls: "ds-pip-input-row" });
        const input = inputRow.createEl("input", { type: "text", placeholder: t(this.plugin.settings.language, "autoload_input_placeholder") });
        const btnAdd = inputRow.createEl("button", { text: t(this.plugin.settings.language, "autoload_add"), cls: "ds-btn-mini", attr: { style: "background: var(--pydata-accent); color: white;" } });

        const renderTags = (container: HTMLElement) => {
            container.empty();
            if (this.plugin.settings.autoloadPackages.length === 0) {
                container.createEl("div", { text: t(this.plugin.settings.language, "no_memorized"), cls: "ds-placeholder-mini" });
            } else {
                const tagList = container.createEl("div", { cls: "ds-pip-tag-list" });
                this.plugin.settings.autoloadPackages.forEach(pkg => {
                    const tag = tagList.createEl("span", { cls: "ds-pip-tag" });
                    tag.createSpan({ text: pkg });
                    const delBtn = tag.createEl("span", { cls: "ds-pip-tag-del", text: "×" });
                    delBtn.onclick = async () => {
                        const pkgToRemove = pkg;
                        if (this.plugin.pyodideReady) {
                            await this.plugin.executePython(`
import sys
import os
import shutil
import micropip

pkg_name = "${pkgToRemove}".replace("-", "_")
for mod in list(sys.modules.keys()):
    if mod == pkg_name or mod.startswith(pkg_name + "."):
        del sys.modules[mod]

site_pkgs = "/lib/python3.11/site-packages"
if os.path.exists(site_pkgs):
    for item in os.listdir(site_pkgs):
        if item.startswith(pkg_name):
            path = os.path.join(site_pkgs, item)
            if os.path.isdir(path): shutil.rmtree(path)
            else: os.remove(path)

try:
    mgr = getattr(micropip, 'PACKAGE_MANAGER', getattr(micropip, '_package_manager', None))
    if mgr and hasattr(mgr, 'installed_packages'):
        if pkg_name in mgr.installed_packages:
            del mgr.installed_packages[pkg_name]
        if "${pkgToRemove}" in mgr.installed_packages:
            del mgr.installed_packages["${pkgToRemove}"]
except:
    pass
`, false);
                        }
                        this.plugin.settings.autoloadPackages = this.plugin.settings.autoloadPackages.filter(p => p !== pkg);
                        await this.plugin.saveSettings();
                        renderTags(container);
                        if (this.plugin.view) this.plugin.view.refreshPackages();
                        new Notice(t(this.plugin.settings.language, "pkg_deleted"));
                    };
                });
            }
        };

        const tagsContainer = containerEl.createEl("div", { attr: { style: "margin-top: 10px;" } });
        renderTags(tagsContainer);

        btnAdd.onclick = async () => {
            const pkgName = input.value.trim();
            if (!pkgName) return;

            if (this.plugin.settings.autoloadPackages.includes(pkgName)) return;

            btnAdd.addClass('ds-is-loading');
            btnAdd.disabled = true;

            if (this.plugin.pyodideReady) {
                new Notice(`${t(this.plugin.settings.language, "installing")}${pkgName}...`);
                const res = await this.plugin.executePython(`
import micropip
try:
    await micropip.install("${pkgName}")
    print("success")
except Exception as e:
    print(f"error:{str(e)}")
`, false);
                if (res.text?.includes("error")) {
                    new Notice(`❌ ${res.text}`);
                    btnAdd.removeClass('ds-is-loading');
                    btnAdd.disabled = false;
                    return;
                }
            }

            this.plugin.settings.autoloadPackages.push(pkgName);
            await this.plugin.saveSettings();
            input.value = "";
            renderTags(tagsContainer);
            if (this.plugin.view) this.plugin.view.refreshPackages();
            btnAdd.removeClass('ds-is-loading');
            btnAdd.disabled = false;
            new Notice(t(this.plugin.settings.language, "pkg_installed"));
        };
    }
}