/*
 * Arduino+ - Snippet Panel Module
 * Copyright 2025 Monster Maker
 * 
 * Licensed under the Apache License, Version 2.0
 */

const vscode = require('vscode');

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
            .empty-state {
                text-align: center;
                padding: 40px;
                color: var(--vscode-descriptionForeground);
            }
        </style>
    </head>
    <body>
        <h2>${escapeHtml(t('snippet.heading'))}</h2>
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
    moveToSnippets
};
