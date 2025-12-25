/*
 * Arduino+ - Snippet Panel Module
 * Copyright 2025 Monster Maker
 * 
 * Licensed under the Apache License, Version 2.0
 */

const vscode = require('vscode');

let snippetPanel = null;
let snippetManager = null;

/**
 * Show or create the snippet panel
 * @param {object} manager - SnippetManager instance
 */
function showSnippetPanel(manager) {
    snippetManager = manager;
    
    if (snippetPanel) {
        snippetPanel.reveal(vscode.ViewColumn.Two);
        updatePanelContent();
        return;
    }

    snippetPanel = vscode.window.createWebviewPanel(
        'arduinoplusSnippets',
        'Arduino+ Snippets',
        vscode.ViewColumn.Two,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    updatePanelContent();

    snippetPanel.onDidDispose(() => {
        snippetPanel = null;
    });

    snippetPanel.webview.onDidReceiveMessage(message => {
        handlePanelMessage(message);
    });
}

/**
 * Update panel HTML content
 */
function updatePanelContent() {
    if (!snippetPanel) return;
    const snippets = snippetManager.getAllSnippets();
    snippetPanel.webview.html = generatePanelHTML(snippets);
}

/**
 * Generate HTML for the panel
 */
function generatePanelHTML(snippets) {
    const snippetItems = snippets.map(snippet => `
        <div class="snippet-item">
            <div class="snippet-header">${escapeHtml(snippet.name)}</div>
            <textarea class="snippet-content" data-id="${snippet.id}">${escapeHtml(snippet.content)}</textarea>
            <div class="snippet-buttons">
                <button onclick="copySnippet(${snippet.id})">Copy</button>
                <button onclick="insertSnippet(${snippet.id})">Insert</button>
                <button onclick="deleteSnippet(${snippet.id})">Delete</button>
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
        <h2>Code Snippets</h2>
        ${snippets.length === 0 ? 
            '<div class="empty-state">No snippets yet. Select code and use "Copy to Snippets" from the context menu.</div>' 
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
function handlePanelMessage(message) {
    switch (message.command) {
        case 'copy':
            copySnippetToClipboard(message.id);
            break;
        case 'insert':
            insertSnippetToEditor(message.id);
            break;
        case 'delete':
            deleteSnippetById(message.id);
            break;
        case 'update':
            snippetManager.updateSnippet(message.id, message.content);
            break;
    }
}

/**
 * Copy snippet to system clipboard
 */
async function copySnippetToClipboard(id) {
    const snippet = snippetManager.getAllSnippets().find(s => s.id === id);
    if (snippet) {
        await vscode.env.clipboard.writeText(snippet.content);
        vscode.window.showInformationMessage('Snippet copied to clipboard!');
    }
}

/**
 * Insert snippet into active editor
 */
async function insertSnippetToEditor(id) {
    const snippet = snippetManager.getAllSnippets().find(s => s.id === id);
    if (!snippet) return;
    
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
    }
    
    await editor.edit(editBuilder => {
        if (editor.selection.isEmpty) {
            editBuilder.insert(editor.selection.active, snippet.content);
        } else {
            editBuilder.replace(editor.selection, snippet.content);
        }
    });
    
    vscode.window.showInformationMessage('Snippet inserted!');
}

/**
 * Delete snippet by ID
 */
function deleteSnippetById(id) {
    snippetManager.deleteSnippet(id);
    updatePanelContent();
    vscode.window.showInformationMessage('Snippet deleted!');
}

/**
 * Copy selected text to snippets
 */
async function copyToSnippets(manager) {
    // Initialize manager if needed
    if (!snippetManager && manager) {
        snippetManager = manager;
    }
    
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
    }

    const selection = editor.selection;
    const text = editor.document.getText(selection);

    if (!text) {
        vscode.window.showWarningMessage('No text selected');
        return;
    }

    snippetManager.addSnippet(text);
    showSnippetPanel(snippetManager);
    vscode.window.showInformationMessage('Added to snippets!');
}

/**
 * Move selected text to snippets (copy + delete original)
 */
async function moveToSnippets(manager) {
    // Initialize manager if needed
    if (!snippetManager && manager) {
        snippetManager = manager;
    }
    
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
    }

    const selection = editor.selection;
    let text = editor.document.getText(selection);

    if (!text) {
        vscode.window.showWarningMessage('No text selected');
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
    
    snippetManager.addSnippet(text);
    
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
    
    showSnippetPanel(snippetManager);
    vscode.window.showInformationMessage('Moved to snippets!');
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
