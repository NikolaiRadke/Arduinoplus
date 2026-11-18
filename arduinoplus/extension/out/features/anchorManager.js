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
const { getSketchFiles, readLines } = require('./todoList');

const ARDUINOPLUS_DIR = path.join(os.homedir(), '.arduinoplus');
const ANCHORS_FILE = path.join(ARDUINOPLUS_DIR, 'anchors.json');
const MIGRATION_CHECK_INTERVAL = 10000; // 10 seconds
const PREVIEW_LENGTH = 50;
// Comment anchor in the code: // @anchor Name
const COMMENT_ANCHOR = /\/\/\s*@anchor\b[ \t]*(.*)$/;

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
     * Add anchor at current cursor position (stored in anchors.json)
     */
    async addAnchor() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage(this.t('common.noEditor'));
            return;
        }

        const fileUri = editor.document.uri.toString();
        
        // Warn if this is an unsaved temp file, comment anchors survive saving
        if (fileUri.includes('.arduinoIDE-unsaved')) {
            const asComment = this.t('anchor.asComment');
            const setAnyway = this.t('anchor.setAnyway');
            const choice = await vscode.window.showWarningMessage(
                '⚠️ ' + this.t('anchor.unsavedWarning'),
                asComment,
                setAnyway,
                this.t('common.cancel')
            );
            
            if (choice === asComment) {
                await this.insertCommentAnchor();
                return;
            }
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
            preview: lineText.substring(0, PREVIEW_LENGTH)
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
     * Insert a comment anchor "// @anchor Name" above the current line.
     * It lives in the code, so it survives saving, renaming and new lines.
     */
    async insertCommentAnchor() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage(this.t('common.noEditor'));
            return;
        }

        const line = editor.selection.active.line;
        const lineText = editor.document.lineAt(line).text;

        const name = await vscode.window.showInputBox({
            prompt: this.t('anchor.namePrompt'),
            placeHolder: this.t('anchor.namePlaceholder'),
            value: lineText.trim().substring(0, 30)
        });

        if (!name) return;

        const indent = lineText.match(/^\s*/)[0];
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(line, 0), `${indent}// @anchor ${name}\n`);
        });

        this.updateStatusBar();
        vscode.window.showInformationMessage(this.t('anchor.added', name, line + 1));
    }

    /**
     * Find comment anchors "// @anchor Name" in a document
     * @param {vscode.TextDocument} document
     * @returns {Array} Anchors with isComment = true
     */
    getCommentAnchors(document) {
        const result = [];
        for (let i = 0; i < document.lineCount; i++) {
            const text = document.lineAt(i).text;
            const match = text.match(COMMENT_ANCHOR);
            if (match) {
                result.push({
                    name: match[1].trim() || this.t('anchor.unnamed'),
                    line: i,
                    preview: text.trim().substring(0, PREVIEW_LENGTH),
                    isComment: true
                });
            }
        }
        return result;
    }

    /**
     * Find the current line of a stored anchor. If lines were added or
     * removed above it, the preview text is searched nearby.
     * @param {vscode.TextDocument} document
     * @param {Object} anchor - Stored anchor
     * @returns {number} Line
     */
    resolveAnchorLine(document, anchor) {
        const lineCount = document.lineCount;
        const stored = Math.max(0, Math.min(anchor.line, lineCount - 1));
        const preview = anchor.preview || '';
        const matches = i => document.lineAt(i).text.trim().substring(0, PREVIEW_LENGTH) === preview;

        // Empty lines can't be found again
        if (!preview || matches(stored)) return stored;

        for (let distance = 1; distance < lineCount; distance++) {
            const above = stored - distance;
            const below = stored + distance;
            if (above < 0 && below >= lineCount) break;
            if (above >= 0 && matches(above)) return above;
            if (below < lineCount && matches(below)) return below;
        }
        return stored;
    }

    /**
     * All anchors of a document: stored and comment anchors, sorted by line
     * @param {vscode.TextDocument} document
     * @param {boolean} resolve - Correct drifted lines of stored anchors (and save them)
     * @returns {Array}
     */
    getAnchorsForDocument(document, resolve = false) {
        const fileUri = document.uri.toString();
        const stored = this.anchors[fileUri] || [];
        let changed = false;

        const storedItems = stored.map((anchor, index) => {
            if (resolve) {
                const line = this.resolveAnchorLine(document, anchor);
                if (line !== anchor.line) {
                    anchor.line = line;
                    changed = true;
                }
            }
            return { ...anchor, index, isComment: false };
        });

        if (changed) {
            this.saveAnchors();
        }

        return [...storedItems, ...this.getCommentAnchors(document)]
            .sort((a, b) => a.line - b.line);
    }

    /**
     * Get anchors for current file
     */
    getAnchorsForCurrentFile(resolve = false) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return [];
        return this.getAnchorsForDocument(editor.document, resolve);
    }

    /**
     * Get all stored anchors across all files
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
            
            const position = new vscode.Position(Math.min(line, document.lineCount - 1), 0);
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
     * Delete stored anchor
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
     * Delete a comment anchor from the code. A line with nothing but the
     * comment is removed completely, otherwise only the comment.
     * @param {vscode.TextEditor} editor
     * @param {number} line
     */
    async deleteCommentAnchor(editor, line) {
        const text = editor.document.lineAt(line).text;
        const start = text.search(/\s*\/\/\s*@anchor\b/);
        if (start === -1) return;

        await editor.edit(editBuilder => {
            if (text.trim().startsWith('//')) {
                const end = line + 1 < editor.document.lineCount
                    ? new vscode.Position(line + 1, 0)
                    : new vscode.Position(line, text.length);
                editBuilder.delete(new vscode.Range(new vscode.Position(line, 0), end));
            } else {
                editBuilder.delete(new vscode.Range(line, start, line, text.length));
            }
        });
        this.updateStatusBar();
    }

    /**
     * QuickPick item for an anchor
     */
    toQuickPickItem(anchor, icon) {
        const where = this.t('anchor.line', anchor.line + 1);
        return {
            label: `${icon || (anchor.isComment ? '🔖' : '📍')} ${anchor.name}`,
            description: anchor.isComment ? `${where} · ${this.t('anchor.inCode')}` : where,
            detail: anchor.preview,
            anchor: anchor
        };
    }

    /**
     * Anchors of all files in the sketch, the current file first
     * @returns {Array<{file: string, uri: string, anchors: Array}>}
     */
    getSketchAnchors() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return [];
        const current = editor.document.uri.fsPath;
        const sketchFolder = path.dirname(current);
        const files = getSketchFiles(sketchFolder);
        if (!files.includes(current)) files.unshift(current);
        files.sort((a, b) => (a === current ? -1 : b === current ? 1 : 0));

        return files.map(file => {
            // Open documents have unsaved changes, the others are read from disk
            const open = file === current
                ? editor.document
                : vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === file);
            const uri = open ? open.uri.toString() : vscode.Uri.file(file).toString();
            const lines = open ? null : readLines(file);
            const document = open || {
                uri: { toString: () => uri },
                lineCount: lines.length,
                lineAt: i => ({ text: lines[i] })
            };
            return { file, label: path.relative(sketchFolder, file), uri, anchors: this.getAnchorsForDocument(document, true) };
        }).filter(group => group.anchors.length > 0);
    }

    /**
     * QuickPick items grouped by file
     */
    buildGroupedItems(groups, icon) {
        const items = [];
        for (const group of groups) {
            items.push({ label: group.label, kind: vscode.QuickPickItemKind.Separator });
            for (const anchor of group.anchors) {
                items.push({ ...this.toQuickPickItem(anchor, icon), fileUri: group.uri });
            }
        }
        return items;
    }

    /**
     * Show the anchors of the whole sketch in a QuickPick
     */
    async showAnchorList() {
        const groups = this.getSketchAnchors();
        this.updateStatusBar();
        
        if (groups.length === 0) {
            vscode.window.showInformationMessage(this.t('anchor.noneInFile'));
            return;
        }

        const sketchName = path.basename(path.dirname(vscode.window.activeTextEditor.document.uri.fsPath));
        const items = [
            ...this.buildGroupedItems(groups),
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            {
                label: '🗑️ ' + this.t('anchor.deleteOption'),
                description: '',
                detail: this.t('anchor.deleteOptionDetail'),
                isDeleteOption: true
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: this.t('anchor.jumpPlaceholder', sketchName),
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (!selected) return;

        if (selected.isDeleteOption) {
            await this.showDeleteAnchorList();
        } else {
            await this.jumpToAnchor(selected.fileUri, selected.anchor.line);
        }
    }

    /**
     * Show delete anchor picker for the whole sketch
     */
    async showDeleteAnchorList() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const groups = this.getSketchAnchors();
        const sketchName = path.basename(path.dirname(editor.document.uri.fsPath));

        const selected = await vscode.window.showQuickPick(
            this.buildGroupedItems(groups, '🗑️'),
            { placeHolder: this.t('anchor.deletePlaceholder', sketchName) }
        );

        if (!selected) return;

        if (selected.anchor.isComment) {
            // Comment anchors live in the code: open the file and edit it
            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(selected.fileUri));
            const target = await vscode.window.showTextDocument(document);
            await this.deleteCommentAnchor(target, selected.anchor.line);
        } else {
            this.deleteAnchor(selected.fileUri, selected.anchor.index);
        }
        vscode.window.showInformationMessage(this.t('anchor.deleted', selected.anchor.name));
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
            // Comment anchors may have been typed in the meantime
            this.updateStatusBar();
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
