/*
 * Arduino+ - Snippet Panel Module
 * Copyright 2025 Monster Maker
 * 
 * Licensed under the Apache License, Version 2.0
 */

const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

let snippetPanel = null;

/**
 * Show or create the snippet panel
 * @param {object} manager - SnippetManager instance
 * @param {Function} t - Translation function
 */
function showSnippetPanel(manager, t) {
    if (snippetPanel) {
        snippetPanel.reveal(vscode.ViewColumn.Two);
        updatePanelContent(manager, t);
        return;
    }

    snippetPanel = vscode.window.createWebviewPanel(
        'arduinoplusSnippets',
        t('snippet.panelTitle'),
        vscode.ViewColumn.Two,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    updatePanelContent(manager, t);

    snippetPanel.onDidDispose(() => {
        snippetPanel = null;
    });

    snippetPanel.webview.onDidReceiveMessage(message => {
        handlePanelMessage(message, manager, t);
    });
}

/**
 * Update panel HTML content
 */
function updatePanelContent(manager, t) {
    if (!snippetPanel) return;
    const snippets = manager.getAllSnippets();
    snippetPanel.webview.html = generatePanelHTML(snippets, t);
}

/**
 * Generate HTML for the panel
 */
function generatePanelHTML(snippets, t) {
    const snippetItems = snippets.map(snippet => `
        <div class="snippet-item">
            <div class="snippet-header">${escapeHtml(snippet.name)}</div>
            <textarea class="snippet-content" data-id="${snippet.id}">${escapeHtml(snippet.content)}</textarea>
            <div class="snippet-buttons">
                <button onclick="copySnippet(${snippet.id})">${escapeHtml(t('snippet.copy'))}</button>
                <button onclick="insertSnippet(${snippet.id})">${escapeHtml(t('snippet.insert'))}</button>
                <button onclick="renameSnippet(${snippet.id})">${escapeHtml(t('snippet.rename'))}</button>
                <button onclick="deleteSnippet(${snippet.id})">${escapeHtml(t('snippet.delete'))}</button>
            </div>
        </div>
    `).join('');

    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {
                padding: 10px;
                color: var(--vscode-foreground);
                font-family: var(--vscode-font-family);
            }
            .snippet-item {
                margin-bottom: 15px;
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                padding: 10px;
                background: var(--vscode-editor-background);
            }
            .snippet-header {
                font-weight: bold;
                margin-bottom: 8px;
                color: var(--vscode-textLink-foreground);
            }
            .snippet-content {
                width: 100%;
                min-height: 60px;
                font-family: var(--vscode-editor-font-family);
                font-size: var(--vscode-editor-font-size);
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                padding: 8px;
                resize: vertical;
                margin-bottom: 8px;
            }
            .snippet-buttons {
                display: flex;
                gap: 8px;
            }
            .snippet-buttons button {
                padding: 6px 12px;
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 2px;
                cursor: pointer;
                font-size: 13px;
            }
            .snippet-buttons button:hover {
                background: var(--vscode-button-hoverBackground);
            }
            .panel-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
            }
            .panel-header .snippet-buttons button {
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
            }
            .panel-header .snippet-buttons button:hover {
                background: var(--vscode-button-secondaryHoverBackground);
            }
            .empty-state {
                text-align: center;
                padding: 40px;
                color: var(--vscode-descriptionForeground);
            }
        </style>
    </head>
    <body>
        <div class="panel-header">
            <h2>${escapeHtml(t('snippet.heading'))}</h2>
            <div class="snippet-buttons">
                <button onclick="importSnippets()">${escapeHtml(t('snippet.import'))}</button>
                <button onclick="exportSnippets()"${snippets.length === 0 ? ' disabled' : ''}>${escapeHtml(t('snippet.export'))}</button>
            </div>
        </div>
        ${snippets.length === 0 ? 
            `<div class="empty-state">${escapeHtml(t('snippet.empty'))}</div>` 
            : snippetItems
        }
        <script>
            const vscode = acquireVsCodeApi();
            
            function copySnippet(id) {
                vscode.postMessage({ command: 'copy', id: id });
            }
            
            function insertSnippet(id) {
                vscode.postMessage({ command: 'insert', id: id });
            }
            
            function deleteSnippet(id) {
                vscode.postMessage({ command: 'delete', id: id });
            }
            
            function renameSnippet(id) {
                vscode.postMessage({ command: 'rename', id: id });
            }
            
            function importSnippets() {
                vscode.postMessage({ command: 'import' });
            }
            
            function exportSnippets() {
                vscode.postMessage({ command: 'export' });
            }
            
            // Handle textarea changes
            document.addEventListener('input', (e) => {
                if (e.target.classList.contains('snippet-content')) {
                    const id = parseInt(e.target.dataset.id);
                    const content = e.target.value;
                    vscode.postMessage({ command: 'update', id: id, content: content });
                }
            });
        </script>
    </body>
    </html>`;
}

/**
 * Handle messages from webview
 */
function handlePanelMessage(message, manager, t) {
    switch (message.command) {
        case 'copy':
            copySnippetToClipboard(message.id, manager, t);
            break;
        case 'insert':
            insertSnippetToEditor(message.id, manager, t);
            break;
        case 'delete':
            deleteSnippetById(message.id, manager, t);
            break;
        case 'update':
            manager.updateSnippet(message.id, message.content);
            break;
        case 'rename':
            renameSnippetById(message.id, manager, t);
            break;
        case 'import':
            importSnippetsFromFile(manager, t);
            break;
        case 'export':
            exportSnippetsToFile(manager, t);
            break;
    }
}

/**
 * Copy snippet to system clipboard
 */
async function copySnippetToClipboard(id, manager, t) {
    const snippet = manager.getAllSnippets().find(s => s.id === id);
    if (snippet) {
        await vscode.env.clipboard.writeText(snippet.content);
        vscode.window.showInformationMessage(t('snippet.copied'));
    }
}

/**
 * Insert snippet into active editor
 */
async function insertSnippetToEditor(id, manager, t) {
    const snippet = manager.getAllSnippets().find(s => s.id === id);
    if (!snippet) return;
    
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage(t('common.noEditor'));
        return;
    }
    
    await editor.edit(editBuilder => {
        if (editor.selection.isEmpty) {
            editBuilder.insert(editor.selection.active, snippet.content);
        } else {
            editBuilder.replace(editor.selection, snippet.content);
        }
    });
    
    vscode.window.showInformationMessage(t('snippet.inserted'));
}

/**
 * Delete snippet by ID
 */
function deleteSnippetById(id, manager, t) {
    manager.deleteSnippet(id);
    updatePanelContent(manager, t);
    vscode.window.showInformationMessage(t('snippet.deleted'));
}

/**
 * Rename snippet by ID
 */
async function renameSnippetById(id, manager, t) {
    const snippet = manager.getAllSnippets().find(s => s.id === id);
    if (!snippet) return;

    const name = await vscode.window.showInputBox({
        prompt: t('snippet.renamePrompt'),
        value: snippet.name
    });
    if (!name || name === snippet.name) return;

    manager.renameSnippet(id, name);
    updatePanelContent(manager, t);
}

/**
 * Import snippets from a JSON file (added to the existing ones)
 */
async function importSnippetsFromFile(manager, t) {
    const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'JSON': ['json'] },
        openLabel: t('snippet.import')
    });
    if (!uris || uris.length === 0) return;

    let count = 0;
    try {
        const list = JSON.parse(fs.readFileSync(uris[0].fsPath, 'utf8'));
        count = manager.importSnippets(list);
    } catch (error) {
        count = 0;
    }

    if (count > 0) {
        updatePanelContent(manager, t);
        vscode.window.showInformationMessage(t('snippet.imported', count));
    } else {
        vscode.window.showWarningMessage(t('snippet.importFailed'));
    }
}

/**
 * Export all snippets to a JSON file
 */
async function exportSnippetsToFile(manager, t) {
    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(os.homedir(), 'arduinoplus-snippets.json')),
        filters: { 'JSON': ['json'] },
        saveLabel: t('snippet.export')
    });
    if (!uri) return;

    try {
        fs.writeFileSync(uri.fsPath, JSON.stringify(manager.exportSnippets(), null, 2), 'utf8');
        vscode.window.showInformationMessage(t('snippet.exported', manager.getAllSnippets().length, path.basename(uri.fsPath)));
    } catch (error) {
        vscode.window.showErrorMessage(t('snippet.exportFailed', error.message));
    }
}

/**
 * Pick a snippet in a QuickPick and insert it at the cursor
 */
async function insertSnippetQuickPick(manager, t) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage(t('common.noEditor'));
        return;
    }

    const snippets = manager.getAllSnippets();
    if (snippets.length === 0) {
        vscode.window.showInformationMessage(t('snippet.empty'));
        return;
    }

    const items = snippets.map(snippet => {
        const lines = snippet.content.split(/\r?\n/);
        const firstLine = lines.find(line => line.trim()) || '';
        return {
            label: `📋 ${snippet.name}`,
            description: t('snippet.lines', lines.length),
            detail: firstLine.trim().substring(0, 80),
            snippet
        };
    });

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: t('snippet.pickPlaceholder'),
        matchOnDetail: true
    });
    if (!selected) return;

    await editor.edit(editBuilder => {
        if (editor.selection.isEmpty) {
            editBuilder.insert(editor.selection.active, selected.snippet.content);
        } else {
            editBuilder.replace(editor.selection, selected.snippet.content);
        }
    });
}

/**
 * Copy selected text to snippets
 */
async function copyToSnippets(manager, t) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage(t('common.noEditor'));
        return;
    }

    const selection = editor.selection;
    const text = editor.document.getText(selection);

    if (!text) {
        vscode.window.showWarningMessage(t('snippet.noSelection'));
        return;
    }

    manager.addSnippet(text);
    showSnippetPanel(manager, t);
    vscode.window.showInformationMessage(t('snippet.added'));
}

/**
 * Move selected text to snippets (copy + delete original)
 */
async function moveToSnippets(manager, t) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage(t('common.noEditor'));
        return;
    }

    const selection = editor.selection;
    let text = editor.document.getText(selection);

    if (!text) {
        vscode.window.showWarningMessage(t('snippet.noSelection'));
        return;
    }

    const startLine = selection.start.line;
    const endLine = selection.end.line;
    
    // Check if selection spans full line(s)
    const lastLine = editor.document.lineAt(endLine);
    const isFullLines = selection.start.character === 0 && 
                       selection.end.character === lastLine.text.length;
    
    // Add newline to snippet if we're deleting full lines
    if (isFullLines) {
        text = text + '\n';
    }
    
    manager.addSnippet(text);
    
    await editor.edit(editBuilder => {
        if (isFullLines) {
            // Delete entire lines including line breaks
            const deleteRange = new vscode.Range(
                startLine, 0,
                Math.min(endLine + 1, editor.document.lineCount), 0
            );
            editBuilder.delete(deleteRange);
        } else {
            editBuilder.delete(selection);
        }
    });
    
    showSnippetPanel(manager, t);
    vscode.window.showInformationMessage(t('snippet.moved'));
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

module.exports = {
    showSnippetPanel,
    updatePanelContent,
    copyToSnippets,
    moveToSnippets,
    insertSnippetQuickPick
};
