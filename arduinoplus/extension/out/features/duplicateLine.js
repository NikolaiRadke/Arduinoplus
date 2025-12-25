/*
 * Arduino+ - Duplicate Line Module
 * Copyright 2025 Monster Maker
 * 
 * Licensed under the Apache License, Version 2.0
 */

const vscode = require('vscode');

/**
 * Duplicate current line(s) down
 * If text is selected, duplicates the selection
 * If no selection, duplicates the current line
 */
function duplicateLine() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const document = editor.document;
    const selection = editor.selection;

    editor.edit(editBuilder => {
        if (selection.isEmpty) {
            // No selection - duplicate current line
            const line = document.lineAt(selection.active.line);
            const lineText = line.text;
            const lineEnd = line.range.end;
            
            // Insert duplicated line below
            editBuilder.insert(lineEnd, '\n' + lineText);
        } else {
            // Selection exists - duplicate selected text
            const selectedText = document.getText(selection);
            const selectionEnd = selection.end;
            
            // Insert duplicated text after selection
            editBuilder.insert(selectionEnd, '\n' + selectedText);
        }
    }).then(success => {
        if (success && selection.isEmpty) {
            // Move cursor to duplicated line
            const newLine = selection.active.line + 1;
            const newPosition = new vscode.Position(newLine, selection.active.character);
            editor.selection = new vscode.Selection(newPosition, newPosition);
        }
    });
}

module.exports = {
    duplicateLine
};
