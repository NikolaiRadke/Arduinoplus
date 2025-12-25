/*
 * Arduino+ - Essential IDE helpers for Arduino development
 * Copyright 2025 Monster Maker
 * 
 * Licensed under the Apache License, Version 2.0
 */

const vscode = require('vscode');

// Feature imports
const toggleLineComment = require('./features/toggleLineComment');
const { SnippetManager } = require('./features/snippetManager');
const { showSnippetPanel, copyToSnippets, moveToSnippets } = require('./features/snippetPanel');

// Global snippet manager instance
let snippetManager;

/**
 * Extension activation
 */
function activate(context) {
    console.log('Arduino+ is now active!');

    // Initialize snippet manager (file-based, no context needed)
    snippetManager = new SnippetManager();

    // Register commands
    const commands = [
        {
            name: 'arduinoplus.toggleLineComment',
            handler: toggleLineComment.toggleLineComment
        },
        {
            name: 'arduinoplus.copyToSnippets',
            handler: () => copyToSnippets(snippetManager)
        },
        {
            name: 'arduinoplus.moveToSnippets',
            handler: () => moveToSnippets(snippetManager)
        },
        {
            name: 'arduinoplus.openSnippetPanel',
            handler: () => showSnippetPanel(snippetManager)
        }
    ];

    // Register all commands
    commands.forEach(cmd => {
        const disposable = vscode.commands.registerCommand(cmd.name, cmd.handler);
        context.subscriptions.push(disposable);
    });
}

/**
 * Extension deactivation
 */
function deactivate() {
    console.log('Arduino+ deactivated');
}

module.exports = {
    activate,
    deactivate
};
