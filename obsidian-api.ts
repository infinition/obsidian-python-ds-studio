/**
 * Obsidian Vault Bridge for Python
 * 
 * This module provides functions accessible from Python via the `obsidian` module.
 * It allows Python code to interact with the Obsidian vault (read/write files, etc.)
 */

import { App, TFile, TFolder, normalizePath } from 'obsidian';

export interface ObsidianBridgeAPI {
    read_file: (path: string) => Promise<string>;
    read_json: (path: string) => Promise<any>;
    read_csv: (path: string) => Promise<string>;
    write_file: (path: string, content: string) => Promise<boolean>;
    write_json: (path: string, data: string) => Promise<boolean>;
    write_csv: (path: string, data: string) => Promise<boolean>;
    create: (path: string, content: string) => Promise<boolean>;
    list_files: (folder: string, extension?: string) => Promise<string[]>;
    search: (query: string) => Promise<string[]>;
    get_frontmatter: (path: string) => Promise<Record<string, any> | null>;
    read_frontmatter: (path: string) => Promise<Record<string, any> | null>;
    update_frontmatter: (path: string, data: Record<string, any>) => Promise<boolean>;
    export_csv: (data: string, path: string) => Promise<boolean>;
    export_json: (data: string, path: string) => Promise<boolean>;
    file_exists: (path: string) => Promise<boolean>;
    create_folder: (path: string) => Promise<boolean>;
    delete_file: (path: string) => Promise<boolean>;
}

/**
 * Creates the Python bridge API with access to the Obsidian vault
 */
export function createObsidianBridge(app: App): ObsidianBridgeAPI {
    
    // --- HELPERS INTERNES ---
    
    /** Sécurise le contenu pour l'écriture : accepte String ou Object */
    const ensureString = (data: any): string => {
        if (typeof data === 'string') return data;
        try { return JSON.stringify(data, null, 2); } 
        catch { return String(data); }
    };

    /** Gère l'écriture de fichier (modify ou create) avec création de dossiers */
    const internalWrite = async (path: string, content: any, ext?: string): Promise<boolean> => {
        let normalizedPath = normalizePath(path);
        if (ext && !normalizedPath.endsWith(ext)) normalizedPath += ext;
        
        const strContent = ensureString(content);
        const file = app.vault.getAbstractFileByPath(normalizedPath);

        if (file instanceof TFile) {
            await app.vault.modify(file, strContent);
        } else {
            const folderPath = normalizedPath.split('/').slice(0, -1).join('/');
            if (folderPath) await app.vault.createFolder(folderPath).catch(() => {}); 
            await app.vault.create(normalizedPath, strContent);
        }
        return true;
    };

    return {
        // --- LECTURE ---

        read_file: async (path: string) => {
            const file = app.vault.getAbstractFileByPath(normalizePath(path));
            if (file instanceof TFile) return await app.vault.read(file);
            throw new Error(`File not found: ${path}`);
        },

        read_json: async (path: string) => {
            const file = app.vault.getAbstractFileByPath(normalizePath(path));
            if (file instanceof TFile) {
                const content = await app.vault.read(file);
                return JSON.parse(content);
            }
            throw new Error(`File not found: ${path}`);
        },

        read_csv: async (path: string) => {
            const file = app.vault.getAbstractFileByPath(normalizePath(path));
            if (file instanceof TFile) return await app.vault.read(file);
            throw new Error(`File not found: ${path}`);
        },

        // --- ÉCRITURE & EXPORT ---

        write_file: async (path, content) => await internalWrite(path, content),
        
        create: async (path, content) => await internalWrite(path, content),

        write_json: async (path, data) => await internalWrite(path, data, '.json'),

        export_json: async (data, path) => await internalWrite(path, data, '.json'),

        write_csv: async (path, data) => await internalWrite(path, data, '.csv'),

        export_csv: async (data, path) => await internalWrite(path, data, '.csv'),

        // --- FICHIERS & DOSSIERS ---

        list_files: async (folder = "", extension?) => {
            const normalizedFolder = normalizePath(folder);
            const abstractFolder = normalizedFolder === "" || normalizedFolder === "."
                ? app.vault.getRoot()
                : app.vault.getAbstractFileByPath(normalizedFolder);

            if (!(abstractFolder instanceof TFolder)) return [];
            
            const files: string[] = [];
            const ext = extension?.replace('.', '');
            
            const collect = (f: TFolder) => {
                for (const child of f.children) {
                    if (child instanceof TFile) {
                        if (!ext || child.extension === ext) files.push(child.path);
                    } else if (child instanceof TFolder) collect(child);
                }
            };
            collect(abstractFolder);
            return files;
        },

        file_exists: async (path) => app.vault.getAbstractFileByPath(normalizePath(path)) !== null,

        create_folder: async (path) => {
            await app.vault.createFolder(normalizePath(path)).catch(() => {});
            return true;
        },

        delete_file: async (path) => {
            const file = app.vault.getAbstractFileByPath(normalizePath(path));
            if (file instanceof TFile || file instanceof TFolder) {
                await app.vault.delete(file, true); // true = corbeille
                return true;
            }
            throw new Error(`Path not found: ${path}`);
        },

        // --- RECHERCHE & METADONNÉES ---

        search: async (query, maxResults = 100) => {
            const files = app.vault.getMarkdownFiles();
            const results: string[] = [];
            const q = query.toLowerCase();

            for (const file of files) {
                if (results.length >= maxResults) break;
                const content = await app.vault.cachedRead(file);
                if (content.toLowerCase().includes(q)) results.push(file.path);
            }
            return results;
        },

        get_frontmatter: async (path) => {
            const file = app.vault.getAbstractFileByPath(normalizePath(path));
            return (file instanceof TFile) ? app.metadataCache.getFileCache(file)?.frontmatter || {} : null;
        },

        read_frontmatter: async (path) => {
            const file = app.vault.getAbstractFileByPath(normalizePath(path));
            return (file instanceof TFile) ? app.metadataCache.getFileCache(file)?.frontmatter || {} : null;
        },

        update_frontmatter: async (path, data) => {
            const file = app.vault.getAbstractFileByPath(normalizePath(path));
            if (file instanceof TFile) {
                await app.fileManager.processFrontMatter(file, (fm) => {
                    Object.assign(fm, data);
                });
                return true;
            }
            throw new Error(`File not found: ${path}`);
        },



    };
}
/**
 * Helper to create folders recursively
 */
async function createFolderRecursive(app: App, path: string): Promise<void> {
    const normalizedPath = normalizePath(path);
    const parts = normalizedPath.split('/');
    let currentPath = '';

    for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const existing = app.vault.getAbstractFileByPath(currentPath);
        if (!existing) {
            await app.vault.createFolder(currentPath);
        }
    }
}

/**
 * Generate Python code for the obsidian module
 * This code is injected into the Pyodide environment
 */
export function getObsidianModulePythonCode(): string {
    return `
# Obsidian Vault Bridge Module
# This module provides access to the Obsidian vault from Python

import json
import js

class ObsidianVault:
    """Bridge to interact with the Obsidian vault from Python."""
    
    @staticmethod
    async def read_file(path: str) -> str:
        """Read content from a file in the vault."""
        try:
            result = await js.window.__obsidian_bridge__.read_file(path)
            return str(result)
        except Exception as e:
            raise Exception(f"Error reading file: {str(e)}")

    @staticmethod
    async def read_json(path: str) -> dict:
        """Read and parse JSON from a file."""
        try:
            result = await js.window.__obsidian_bridge__.read_json(path)
            if result:
                # result is a JS object, convert to Python dict
                json_str = js.JSON.stringify(result)
                return json.loads(str(json_str))
            return {}
        except Exception as e:
            raise Exception(f"Error reading JSON: {str(e)}")

    @staticmethod
    async def read_csv(path: str, **kwargs):
        """Read CSV file and return as pandas DataFrame if available."""
        try:
            content = await js.window.__obsidian_bridge__.read_csv(path)
            import io
            try:
                import pandas as pd
                return pd.read_csv(io.StringIO(str(content)), **kwargs)
            except ImportError:
                return str(content)
        except Exception as e:
            raise Exception(f"Error reading CSV: {str(e)}")
    
    @staticmethod
    async def write_file(path: str, content: str) -> bool:
        """Write content to a file in the vault."""
        try:
            result = await js.window.__obsidian_bridge__.write_file(path, content)
            return bool(result)
        except Exception as e:
            raise Exception(f"Error writing file: {str(e)}")

    @staticmethod
    async def write_json(path: str, data) -> bool:
        """Write data to JSON in the vault."""
        try:
            import pandas as pd
            if isinstance(data, pd.DataFrame):
                json_str = data.to_json(orient='records', indent=4)
            else:
                json_str = json.dumps(data, indent=4, default=str)
            result = await js.window.__obsidian_bridge__.write_json(path, json_str)
            return bool(result)
        except Exception as e:
            raise Exception(f"Error writing JSON: {str(e)}")

    @staticmethod
    async def write_csv(path: str, data) -> bool:
        """Write data to CSV in the vault."""
        try:
            import pandas as pd
            if isinstance(data, pd.DataFrame):
                csv_data = data.to_csv(index=False)
            else:
                csv_data = str(data)
            result = await js.window.__obsidian_bridge__.write_csv(path, csv_data)
            return bool(result)
        except Exception as e:
            raise Exception(f"Error writing CSV: {str(e)}")

    @staticmethod
    async def create(path: str, content: str) -> bool:
        """Create or overwrite a file in the vault."""
        try:
            result = await js.window.__obsidian_bridge__.create(path, content)
            return bool(result)
        except Exception as e:
            raise Exception(f"Error creating file: {str(e)}")
    
    @staticmethod
    async def list_files(folder: str = "", extension: str = None) -> list:
        """List files in a folder, optionally filtered by extension."""
        try:
            result = await js.window.__obsidian_bridge__.list_files(folder, extension)
            return list(result)
        except Exception as e:
            raise Exception(f"Error listing files: {str(e)}")

    @staticmethod
    async def search(query: str) -> list:
        """Search for files containing specific text."""
        try:
            result = await js.window.__obsidian_bridge__.search(query)
            return list(result)
        except Exception as e:
            raise Exception(f"Error searching files: {str(e)}")
    
    @staticmethod
    async def get_frontmatter(path: str) -> dict:
        """Get frontmatter (YAML metadata) from a markdown file."""
        try:
            result = await js.window.__obsidian_bridge__.get_frontmatter(path)
            if result:
                json_str = js.JSON.stringify(result)
                return json.loads(str(json_str))
            return {}
        except Exception as e:
            raise Exception(f"Error getting frontmatter: {str(e)}")

    @staticmethod
    async def read_frontmatter(path: str) -> dict:
        """Read frontmatter (YAML metadata) from a markdown file."""
        try:
            result = await js.window.__obsidian_bridge__.read_frontmatter(path)
            if result:
                json_str = js.JSON.stringify(result)
                return json.loads(str(json_str))
            return {}
        except Exception as e:
            raise Exception(f"Error reading frontmatter: {str(e)}")

    @staticmethod
    async def update_frontmatter(path: str, data: dict) -> bool:
        """Update frontmatter (YAML metadata) in a markdown file."""
        try:
            # Convert Python dict to JS object via JSON
            js_data = js.JSON.parse(json.dumps(data))
            result = await js.window.__obsidian_bridge__.update_frontmatter(path, js_data)
            return bool(result)
        except Exception as e:
            raise Exception(f"Error updating frontmatter: {str(e)}")
    
    @staticmethod
    async def export_csv(df, path: str) -> bool:
        """Export a pandas DataFrame to CSV in the vault."""
        try:
            csv_data = df.to_csv(index=False)
            result = await js.window.__obsidian_bridge__.export_csv(csv_data, path)
            return bool(result)
        except Exception as e:
            raise Exception(f"Error exporting CSV: {str(e)}")
    
    @staticmethod
    async def export_json(data, path: str) -> bool:
        """Export data to JSON in the vault."""
        try:
            import pandas as pd
            if isinstance(data, pd.DataFrame):
                json_str = data.to_json(orient='records', indent=4)
            else:
                json_str = json.dumps(data, indent=4, default=str)
            result = await js.window.__obsidian_bridge__.export_json(json_str, path)
            return bool(result)
        except Exception as e:
            raise Exception(f"Error exporting JSON: {str(e)}")
    
    @staticmethod
    async def file_exists(path: str) -> bool:
        """Check if a file exists in the vault."""
        try:
            result = await js.window.__obsidian_bridge__.file_exists(path)
            return bool(result)
        except Exception as e:
            return False
    
    @staticmethod
    async def create_folder(path: str) -> bool:
        """Create a folder in the vault."""
        try:
            result = await js.window.__obsidian_bridge__.create_folder(path)
            return bool(result)
        except Exception as e:
            raise Exception(f"Error creating folder: {str(e)}")

    @staticmethod
    async def delete_file(path: str) -> bool:
        """Delete a file in the vault."""
        try:
            result = await js.window.__obsidian_bridge__.delete_file(path)
            return bool(result)
        except Exception as e:
            raise Exception(f"Error deleting file: {str(e)}")



# Convenience functions at module level
async def read_file(path: str) -> str:
    return await ObsidianVault.read_file(path)

async def read_json(path: str) -> dict:
    return await ObsidianVault.read_json(path)

async def read_csv(path: str, **kwargs):
    return await ObsidianVault.read_csv(path, **kwargs)

async def write_file(path: str, content: str) -> bool:
    return await ObsidianVault.write_file(path, content)

async def write_json(path: str, data) -> bool:
    return await ObsidianVault.write_json(path, data)

async def write_csv(path: str, data) -> bool:
    return await ObsidianVault.write_csv(path, data)

async def create(path: str, content: str) -> bool:
    return await ObsidianVault.create(path, content)

async def list_files(folder: str = "", extension: str = None) -> list:
    return await ObsidianVault.list_files(folder, extension)

async def search(query: str) -> list:
    return await ObsidianVault.search(query)

async def get_frontmatter(path: str) -> dict:
    return await ObsidianVault.get_frontmatter(path)

async def read_frontmatter(path: str) -> dict:
    return await ObsidianVault.read_frontmatter(path)

async def update_frontmatter(path: str, data: dict) -> bool:
    return await ObsidianVault.update_frontmatter(path, data)

async def export_csv(df, path: str) -> bool:
    return await ObsidianVault.export_csv(df, path)

async def export_json(data, path: str) -> bool:
    return await ObsidianVault.export_json(data, path)

async def file_exists(path: str) -> bool:
    return await ObsidianVault.file_exists(path)

async def create_folder(path: str) -> bool:
    return await ObsidianVault.create_folder(path)
    
async def delete_file(path: str) -> bool:
    return await ObsidianVault.delete_file(path)



# For convenience: vault object
vault = ObsidianVault()

print("📦 Obsidian module loaded! Use: from obsidian import vault")
`
}
