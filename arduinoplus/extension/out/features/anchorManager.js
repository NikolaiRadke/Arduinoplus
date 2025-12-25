/*
 * Arduino+ - Anchor Manager Module
 * Copyright 2025 Monster Maker
 * 
 * Licensed under the Apache License, Version 2.0
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');

const ARDUINOPLUS_DIR = path.join(os.homedir(), '.arduinoplus');
const ANCHORS_FILE = path.join(ARDUINOPLUS_DIR, 'anchors.json');

/**
 * Anchor Manager - handles code anchors/bookmarks
 * Stores anchors per file in ~/.arduinoplus/anchors.json
 */
class AnchorManager {
    constructor() {
        this.anchors = {};
        this.ensureDirectory();
        this.loadAnchors();
        this.cleanupAnchors();
        this.statusBarItem = null;
        
        // Start periodic migration check
        this.startMigrationTimer();
    }

    /**
     * Ensure .arduinoplus directory exists
     */
    ensureDirectory() {
        if (!fs.existsSync(ARDUINOPLUS_DIR)) {
            try {
                fs.mkdirSync(ARDUINOPLUS_DIR, { recursive: true });
            } catch (error) {
                // Silent fail
            }
        }
    }

    /**
     * Load anchors from file
     */
    loadAnchors() {
        if (!fs.existsSync(ANCHORS_FILE)) {
            this.anchors = {};
            return;
        }

        try {
            const data = fs.readFileSync(ANCHORS_FILE, 'utf8');
            this.anchors = JSON.parse(data);
        } catch (error) {
            this.anchors = {};
        }
    }

    /**
     * Save anchors to file (atomic write)
     */
    saveAnchors() {
        try {
            const tempFile = ANCHORS_FILE + '.tmp';
            const data = JSON.stringify(this.anchors, null, 2);
            
            fs.writeFileSync(tempFile, data, 'utf8');
            fs.renameSync(tempFile, ANCHORS_FILE);
            
            return true;
        } catch (error) {
            const tempFile = ANCHORS_FILE + '.tmp';
            if (fs.existsSync(tempFile)) {
                try {
                    fs.unlinkSync(tempFile);
                } catch {}
            }
            
            return false;
        }
    }

    /**
     * Add anchor at current cursor position
     */
    async addAnchor() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const fileUri = editor.document.uri.toString();
        
        // Warn if this is an unsaved temp file
        if (fileUri.includes('.arduinoIDE-unsaved')) {
            const choice = await vscode.window.showWarningMessage(
                '⚠️ This sketch is not saved yet. Anchors will be lost when you save. Save the sketch first!',
                'Set Anyway',
                'Cancel'
            );
            
            if (choice !== 'Set Anyway') {
                return;
            }
        }
        
        const line = editor.selection.active.line;
        const lineText = editor.document.lineAt(line).text.trim();
        
        // Ask for anchor name
        const name = await vscode.window.showInputBox({
            prompt: 'Enter anchor name',
            placeHolder: 'e.g., Main Loop, WiFi Setup',
            value: lineText.substring(0, 30)
        });

        if (!name) return;

        // Create anchor
        const anchor = {
            name: name,
            line: line,
            preview: lineText.substring(0, 50)
        };

        // Add to anchors
        if (!this.anchors[fileUri]) {
            this.anchors[fileUri] = [];
        }

        this.anchors[fileUri].push(anchor);
        this.saveAnchors();
        this.updateStatusBar();

        vscode.window.showInformationMessage(`Anchor "${name}" added at line ${line + 1}`);
    }

    /**
     * Get anchors for current file
     */
    getAnchorsForCurrentFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return [];

        const fileUri = editor.document.uri.toString();
        return this.anchors[fileUri] || [];
    }

    /**
     * Get all anchors across all files
     */
    getAllAnchors() {
        return this.anchors;
    }

    /**
     * Jump to anchor
     */
    async jumpToAnchor(fileUri, line) {
        try {
            const uri = vscode.Uri.parse(fileUri);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);
            
            const position = new vscode.Position(line, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to jump to anchor: ${error.message}`);
        }
    }

    /**
     * Delete anchor
     */
    deleteAnchor(fileUri, index) {
        if (this.anchors[fileUri] && this.anchors[fileUri][index]) {
            this.anchors[fileUri].splice(index, 1);
            
            // Remove file entry if no anchors left
            if (this.anchors[fileUri].length === 0) {
                delete this.anchors[fileUri];
            }
            
            this.saveAnchors();
            this.updateStatusBar();
        }
    }

    /**
     * Show anchor list in QuickPick
     */
    async showAnchorList() {
        const currentFileAnchors = this.getAnchorsForCurrentFile();
        
        if (currentFileAnchors.length === 0) {
            vscode.window.showInformationMessage('No anchors in current file. Use "Set Anchor" to create one.');
            return;
        }

        const editor = vscode.window.activeTextEditor;
        const fileUri = editor.document.uri.toString();
        const fileName = path.basename(editor.document.fileName);

        // Build QuickPick items for anchors
        const anchorItems = currentFileAnchors.map((anchor, index) => ({
            label: `📍 ${anchor.name}`,
            description: `Line ${anchor.line + 1}`,
            detail: anchor.preview,
            fileUri: fileUri,
            line: anchor.line,
            index: index,
            isDeleteOption: false
        }));

        // Add separator and delete option
        const items = [
            ...anchorItems,
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            {
                label: '🗑️ Delete an anchor...',
                description: '',
                detail: 'Remove an anchor from this file',
                isDeleteOption: true
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Jump to anchor in ${fileName}`,
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (!selected) return;

        if (selected.isDeleteOption) {
            await this.showDeleteAnchorList();
        } else {
            await this.jumpToAnchor(selected.fileUri, selected.line);
        }
    }

    /**
     * Show delete anchor picker
     */
    async showDeleteAnchorList() {
        const currentFileAnchors = this.getAnchorsForCurrentFile();
        const editor = vscode.window.activeTextEditor;
        const fileUri = editor.document.uri.toString();
        const fileName = path.basename(editor.document.fileName);

        const items = currentFileAnchors.map((anchor, index) => ({
            label: `🗑️ ${anchor.name}`,
            description: `Line ${anchor.line + 1}`,
            detail: anchor.preview,
            index: index
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Delete anchor from ${fileName}`
        });

        if (selected) {
            this.deleteAnchor(fileUri, selected.index);
            vscode.window.showInformationMessage(`Anchor "${selected.label.replace('🗑️ ', '')}" deleted`);
        }
    }

    /**
     * Create and update status bar item
     */
    createStatusBar(context) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'arduinoplus.showAnchors';
        this.statusBarItem.tooltip = 'Click to view anchors';
        context.subscriptions.push(this.statusBarItem);
        
        this.updateStatusBar();
    }

    /**
     * Update status bar with anchor count
     */
    updateStatusBar() {
        if (!this.statusBarItem) return;

        const count = this.getAnchorsForCurrentFile().length;
        
        if (count > 0) {
            this.statusBarItem.text = `📍 Anchors (${count})`;
            this.statusBarItem.show();
        } else {
            this.statusBarItem.hide();
        }
    }

    /**
     * Clean up anchors for deleted/non-existent files
     */
    cleanupAnchors() {
        let cleaned = false;
        
        for (const fileUri in this.anchors) {
            try {
                const uri = vscode.Uri.parse(fileUri);
                
                // Check if file still exists
                if (!fs.existsSync(uri.fsPath)) {
                    delete this.anchors[fileUri];
                    cleaned = true;
                }
            } catch (error) {
                // Invalid URI or other error - remove it
                delete this.anchors[fileUri];
                cleaned = true;
            }
        }

        if (cleaned) {
            this.saveAnchors();
        }
    }

    /**
     * Start periodic check for temp file migration
     */
    startMigrationTimer() {
        setInterval(() => {
            this.checkAndMigrateTempAnchors();
        }, 10000);
    }

    /**
     * Check if temp anchors can be migrated to saved files
     */
    checkAndMigrateTempAnchors() {
        // Early exit if no temp anchors exist
        const tempUris = Object.keys(this.anchors).filter(uri => 
            uri.includes('.arduinoIDE-unsaved')
        );
        if (tempUris.length === 0) return;
        
        // Check ALL open editors, not just active one
        const allEditors = vscode.window.visibleTextEditors;
        
        for (const editor of allEditors) {
            const currentUri = editor.document.uri.toString();
            
            // Skip temp files
            if (currentUri.includes('.arduinoIDE-unsaved')) continue;
            
            const currentFileName = path.basename(editor.document.fileName);
            
            // Look for temp anchors with same filename
            for (const tempUri of tempUris) {
                if (tempUri.includes(currentFileName)) {
                    // Migrate!
                    this.anchors[currentUri] = this.anchors[tempUri];
                    delete this.anchors[tempUri];
                    this.saveAnchors();
                    this.updateStatusBar();
                    return;
                }
            }
        }
    }
}

module.exports = { AnchorManager };
