/*
 * Arduino+ - TODO List Module
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 */

"use strict";

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const SKETCH_EXTENSIONS = ['.ino', '.h', '.hpp', '.c', '.cpp'];
const MAX_DEPTH = 3; // Sketch folder and src/ subfolders
const KEYWORDS = { TODO: '📝', FIXME: '🔧' };
const KEYWORD_PATTERN = /\b(TODO|FIXME)\b[\s:\-]*(.*)$/;

/**
 * Collect all source files of a sketch folder
 * @param {string} folder
 * @param {number} depth
 * @returns {string[]} Absolute paths
 */
function collectSketchFiles(folder, depth = 0) {
    let files = [];
    let entries = [];
    try {
        entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch (error) {
        return files;
    }

    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const full = path.join(folder, entry.name);
        if (entry.isDirectory()) {
            // Arduino compiles src/ recursively, build folders are skipped
            if (depth < MAX_DEPTH && (depth > 0 || entry.name === 'src')) {
                files = files.concat(collectSketchFiles(full, depth + 1));
            }
        } else if (SKETCH_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
            files.push(full);
        }
    }
    return files;
}

/**
 * Source files of the sketch, main .ino first, then alphabetical like the IDE tabs
 * @param {string} sketchFolder
 * @returns {string[]}
 */
function getSketchFiles(sketchFolder) {
    const sketchName = path.basename(sketchFolder);
    return collectSketchFiles(sketchFolder).sort((a, b) => {
        const mainA = path.basename(a, '.ino') === sketchName ? 0 : 1;
        const mainB = path.basename(b, '.ino') === sketchName ? 0 : 1;
        return mainA - mainB || a.localeCompare(b);
    });
}

/**
 * Text of a file, taken from an open editor if possible (unsaved changes)
 * @param {string} file
 * @returns {string[]} Lines
 */
function readLines(file) {
    const open = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === file);
    if (open) {
        return open.getText().split(/\r?\n/);
    }
    try {
        return fs.readFileSync(file, 'utf8').split(/\r?\n/);
    } catch (error) {
        return [];
    }
}

/**
 * Find TODO and FIXME in comments
 * @param {string[]} lines
 * @returns {Array<{keyword: string, text: string, line: number}>}
 */
function findTodos(lines) {
    const result = [];
    lines.forEach((text, line) => {
        // Only look into comments: after // or /*, or a line starting with *
        let comment = null;
        const lineComment = text.indexOf('//');
        const blockComment = text.indexOf('/*');
        const starts = [lineComment, blockComment].filter(i => i !== -1);
        if (starts.length > 0) {
            comment = text.substring(Math.min(...starts) + 2);
        } else if (/^\s*\*/.test(text)) {
            comment = text;
        }
        if (comment === null) return;

        const match = comment.match(KEYWORD_PATTERN);
        if (match) {
            result.push({
                keyword: match[1],
                text: match[2].replace(/\*\/\s*$/, '').trim(),
                line
            });
        }
    });
    return result;
}

/**
 * Show all TODOs and FIXMEs of the current sketch
 * @param {Function} t - Translation function
 */
async function showTodoList(t) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage(t('common.noEditor'));
        return;
    }

    const sketchFolder = path.dirname(editor.document.uri.fsPath);
    const sketchName = path.basename(sketchFolder);
    const files = getSketchFiles(sketchFolder);

    const items = [];
    for (const file of files) {
        const todos = findTodos(readLines(file));
        if (todos.length === 0) continue;

        items.push({ label: path.relative(sketchFolder, file), kind: vscode.QuickPickItemKind.Separator });
        for (const todo of todos) {
            items.push({
                label: `${KEYWORDS[todo.keyword]} ${todo.text || todo.keyword}`,
                description: `${todo.keyword} · ${path.basename(file)}:${todo.line + 1}`,
                file,
                line: todo.line
            });
        }
    }

    if (items.length === 0) {
        vscode.window.showInformationMessage(t('todo.none'));
        return;
    }

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: t('todo.placeholder', items.filter(item => item.file).length, sketchName),
        matchOnDescription: true
    });
    if (!selected || !selected.file) return;

    try {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(selected.file));
        const target = await vscode.window.showTextDocument(document);
        const position = new vscode.Position(selected.line, 0);
        target.selection = new vscode.Selection(position, position);
        target.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    } catch (error) {
        vscode.window.showErrorMessage(t('common.openFailed', error.message));
    }
}

module.exports = {
    showTodoList,
    findTodos,
    collectSketchFiles,
    getSketchFiles,
    readLines
};
