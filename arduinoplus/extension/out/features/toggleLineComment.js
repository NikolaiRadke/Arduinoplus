/*
 * Arduino+ - Toggle Line Comment Module
 * Copyright 2025 Monster Maker
 * 
 * Licensed under the Apache License, Version 2.0
 */

const vscode = require('vscode');

/**
 * Toggle line comments (add or remove //) for selected lines
 * Pure editor function - useful for debugging
 */
async function toggleLineComment() {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
        return;
    }
    
    const document = editor.document;
    const selection = editor.selection;
    
    // Determine line range
    const startLine = selection.start.line;
    const endLine = selection.end.line;
    
    // Check if all lines are commented
    let allCommented = true;
    for (let i = startLine; i <= endLine; i++) {
        const line = document.lineAt(i);
        const trimmed = line.text.trimStart();
        if (trimmed.length > 0 && !trimmed.startsWith('//')) {
            allCommented = false;
            break;
        }
    }
    
    // Apply changes
    await editor.edit(editBuilder => {
        for (let i = startLine; i <= endLine; i++) {
            const line = document.lineAt(i);
            const text = line.text;
            
            if (allCommented) {
                // Remove comment: find first // and remove it (including space if present)
                const commentIndex = text.indexOf('//');
                if (commentIndex !== -1) {
                    // Check if there's a space after //
                    const hasSpace = text[commentIndex + 2] === ' ';
                    const charsToRemove = hasSpace ? 3 : 2; // Remove '// ' or just '//'
                    
                    const range = new vscode.Range(
                        i, commentIndex,
                        i, commentIndex + charsToRemove
                    );
                    editBuilder.delete(range);
                }
            } else {
                // Add comment: insert // at start of line (after indentation)
                const firstNonWhitespace = text.search(/\S/);
                if (firstNonWhitespace !== -1) {
                    editBuilder.insert(
                        new vscode.Position(i, firstNonWhitespace),
                        '// '
                    );
                } else if (text.length === 0) {
                    // Empty line - insert at start
                    editBuilder.insert(
                        new vscode.Position(i, 0),
                        '// '
                    );
                }
            }
        }
    });
}

module.exports = {
    toggleLineComment
};
