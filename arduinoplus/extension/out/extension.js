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
const { showSnippetPanel, copyToSnippets, moveToSnippets, insertSnippetQuickPick } = require('./features/snippetPanel');
const { AnchorManager } = require('./features/anchorManager');
const { duplicateLine } = require('./features/duplicateLine');
const AboutPanel = require('./features/aboutPanel');
const { showTodoList } = require('./features/todoList');
const { convertNumber } = require('./features/numberConverter');
const { LcdCharEditor } = require('./features/lcdCharEditor');
const { loadTranslations, t } = require('./utils/localeLoader');

// Global manager instances
let snippetManager;
let anchorManager;
let aboutPanel;
let lcdCharEditor;

/**
 * Extension activation
 */
function activate(context) {
    // Load translations (IDE language, fallback English)
    loadTranslations();

    // Initialize snippet manager
    snippetManager = new SnippetManager();

    // Initialize anchor manager
    anchorManager = new AnchorManager(t);
    anchorManager.createStatusBar(context);

    // About page with changelog and uninstaller
    aboutPanel = new AboutPanel(t);

    // LCD custom character editor
    lcdCharEditor = new LcdCharEditor(t);

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
            handler: () => copyToSnippets(snippetManager, t)
        },
        {
            name: 'arduinoplus.moveToSnippets',
            handler: () => moveToSnippets(snippetManager, t)
        },
        {
            name: 'arduinoplus.openSnippetPanel',
            handler: () => showSnippetPanel(snippetManager, t)
        },
        {
            name: 'arduinoplus.setAnchor',
            handler: () => anchorManager.addAnchor()
        },
        {
            name: 'arduinoplus.insertSnippet',
            handler: () => insertSnippetQuickPick(snippetManager, t)
        },
        {
            name: 'arduinoplus.insertCommentAnchor',
            handler: () => anchorManager.insertCommentAnchor()
        },
        {
            name: 'arduinoplus.showAnchors',
            handler: () => anchorManager.showAnchorList()
        },
        {
            name: 'arduinoplus.convertNumber',
            handler: () => convertNumber(t)
        },
        {
            name: 'arduinoplus.lcdCharEditor',
            handler: () => lcdCharEditor.show()
        },
        {
            name: 'arduinoplus.showTodos',
            handler: () => showTodoList(t)
        },
        {
            name: 'arduinoplus.duplicateLine',
            handler: () => duplicateLine()
        },
        {
            name: 'arduinoplus.about',
            handler: () => aboutPanel.show()
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
    if (anchorManager) {
        anchorManager.stopMigrationTimer();
    }
}

module.exports = {
    activate,
    deactivate
};
