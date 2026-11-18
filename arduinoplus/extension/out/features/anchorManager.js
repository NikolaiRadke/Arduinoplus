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
const MIGRATION_CHECK_INTERVAL = 10000; // 10 seconds

/**
 * Anchor Manager - handles code anchors/bookmarks
 * Stores anchors per file in ~/.arduinoplus/anchors.json
 */
class AnchorManager {
    /**
     * @param {Function} t - Translation function
     */
    constructor(t) {
        this.t = t;
        this.anchors = {};
        this.ensureDirectory();
        this.loadAnchors();
        this.cleanupAnchors();
        this.statusBarItem = null;
        this.migrationTimer = null;
        
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
            vscode.window.showWarningMessage(this.t('common.noEditor'));
            return;
        }

        const fileUri = editor.document.uri.toString();
        
        // Warn if this is an unsaved temp file
        if (fileUri.includes('.arduinoIDE-unsaved')) {
            const setAnyway = this.t('anchor.setAnyway');
            const choice = await vscode.window.showWarningMessage(
                '⚠️ ' + this.t('anchor.unsavedWarning'),
                setAnyway,
                this.t('common.cancel')
            );
            
            if (choice !== setAnyway) {
                return;
            }
        }
        
        const line = editor.selection.active.line;
        const lineText = editor.document.lineAt(line).text.trim();
        
        // Ask for anchor name
        const name = await vscode.window.showInputBox({
            prompt: this.t('anchor.namePrompt'),
            placeHolder: this.t('anchor.namePlaceholder'),
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

        vscode.window.showInformationMessage(this.t('anchor.added', name, line + 1));
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
            vscode.window.showErrorMessage(this.t('anchor.jumpFailed', error.message));
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
            vscode.window.showInformationMessage(this.t('anchor.noneInFile'));
            return;
        }

        const editor = vscode.window.activeTextEditor;
        const fileUri = editor.document.uri.toString();
        const fileName = path.basename(editor.document.fileName);

        // Build QuickPick items for anchors
        const anchorItems = currentFileAnchors.map((anchor, index) => ({
            label: `📍 ${anchor.name}`,
            description: this.t('anchor.line', anchor.line + 1),
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
                label: '🗑️ ' + this.t('anchor.deleteOption'),
                description: '',
                detail: this.t('anchor.deleteOptionDetail'),
                isDeleteOption: true
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: this.t('anchor.jumpPlaceholder', fileName),
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
            description: this.t('anchor.line', anchor.line + 1),
            detail: anchor.preview,
            name: anchor.name,
            index: index
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: this.t('anchor.deletePlaceholder', fileName)
        });

        if (selected) {
            this.deleteAnchor(fileUri, selected.index);
            vscode.window.showInformationMessage(this.t('anchor.deleted', selected.name));
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
        this.statusBarItem.tooltip = this.t('anchor.statusTooltip');
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
            this.statusBarItem.text = '📍 ' + this.t('anchor.status', count);
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
        this.migrationTimer = setInterval(() => {
            this.checkAndMigrateTempAnchors();
        }, MIGRATION_CHECK_INTERVAL);
    }

    /**
     * Stop periodic migration check
     */
    stopMigrationTimer() {
        if (this.migrationTimer) {
            clearInterval(this.migrationTimer);
            this.migrationTimer = null;
        }
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
