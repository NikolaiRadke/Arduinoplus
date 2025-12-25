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
const { AnchorManager } = require('./features/anchorManager');
const { duplicateLine } = require('./features/duplicateLine');

// Global manager instances
let snippetManager;
let anchorManager;

/**
 * Extension activation
 */
function activate(context) {
    console.log('Arduino+ is now active!');

    // Initialize snippet manager
    snippetManager = new SnippetManager();

    // Initialize anchor manager
    anchorManager = new AnchorManager();
    anchorManager.createStatusBar(context);

    // Update status bar when active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            anchorManager.updateStatusBar();
        })
    );

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
        },
        {
            name: 'arduinoplus.setAnchor',
            handler: () => anchorManager.addAnchor()
        },
        {
            name: 'arduinoplus.showAnchors',
            handler: () => anchorManager.showAnchorList()
        },
        {
            name: 'arduinoplus.duplicateLine',
            handler: () => duplicateLine()
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
