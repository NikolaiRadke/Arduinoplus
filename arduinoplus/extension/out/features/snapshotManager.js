/*
 * Arduino+ - Sketch Snapshots
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 *
 * The Arduino IDE has no history. A snapshot copies all source files of a
 * sketch (with unsaved changes) to ~/.arduinoplus/snapshots/<sketch>/<time>/.
 */

"use strict";

const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getSketchFiles } = require('./todoList');

const SNAPSHOT_DIR = path.join(os.homedir(), '.arduinoplus', 'snapshots');
const META_FILE = 'snapshot.json';

class SnapshotManager {
    /**
     * @param {Function} t - Translation function
     */
    constructor(t) {
        this.t = t;
    }

    /**
     * Sketch folder and name of the active editor
     * @returns {{folder: string, name: string}|null}
     */
    getSketch() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return null;
        const folder = path.dirname(editor.document.uri.fsPath);
        return { folder, name: path.basename(folder) };
    }

    /**
     * Folder with all snapshots of a sketch (by name, so a sketch keeps its
     * snapshots when it is saved for the first time or moved)
     */
    sketchDir(name) {
        return path.join(SNAPSHOT_DIR, name.replace(/[^\w.-]/g, '_'));
    }

    /**
     * Date as text in the IDE language
     */
    formatDate(iso) {
        try {
            return new Date(iso).toLocaleString(vscode.env.language || 'en', {
                dateStyle: 'medium', timeStyle: 'medium'
            });
        } catch (error) {
            return iso;
        }
    }

    /**
     * All snapshots of a sketch, newest first
     * @param {string} name - Sketch name
     * @returns {Array<{dir: string, created: string, note: string, files: string[], sketchPath: string}>}
     */
    listSnapshots(name) {
        const dir = this.sketchDir(name);
        if (!fs.existsSync(dir)) return [];
        const result = [];
        for (const entry of fs.readdirSync(dir)) {
            try {
                const meta = JSON.parse(fs.readFileSync(path.join(dir, entry, META_FILE), 'utf8'));
                result.push({ ...meta, dir: path.join(dir, entry) });
            } catch (error) {
                // Not a snapshot folder
            }
        }
        return result.sort((a, b) => b.created.localeCompare(a.created));
    }

    /**
     * Copy all source files of the sketch, open editors with their unsaved text
     * @param {{folder: string, name: string}} sketch
     * @param {string} note
     * @returns {Object} Snapshot meta data
     */
    createSnapshot(sketch, note) {
        const files = getSketchFiles(sketch.folder);
        if (files.length === 0) {
            throw new Error(this.t('snapshot.noFiles'));
        }

        const created = new Date().toISOString();
        let dir = path.join(this.sketchDir(sketch.name), created.replace(/[:.]/g, '-'));
        // Two snapshots in the same millisecond (restore right after create)
        while (fs.existsSync(dir)) dir += '_';

        const relativeFiles = [];
        for (const file of files) {
            const relative = path.relative(sketch.folder, file);
            const target = path.join(dir, 'files', relative);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            // Open editors with their unsaved text, closed files byte by byte (line endings stay)
            const open = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === file);
            if (open) {
                fs.writeFileSync(target, open.getText(), 'utf8');
            } else {
                fs.copyFileSync(file, target);
            }
            relativeFiles.push(relative.split(path.sep).join('/'));
        }

        const meta = { created, note: note || '', sketchPath: sketch.folder, files: relativeFiles };
        fs.writeFileSync(path.join(dir, META_FILE), JSON.stringify(meta, null, 2), 'utf8');
        return { ...meta, dir };
    }

    /**
     * Write a file back: open documents are edited and saved,
     * closed files are written to disk
     * @returns {boolean} True if the file did not exist before
     */
    async restoreFile(snapshot, relative, sketchFolder) {
        const content = fs.readFileSync(path.join(snapshot.dir, 'files', ...relative.split('/')), 'utf8');
        const target = path.join(sketchFolder, ...relative.split('/'));
        const open = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === target);

        if (open) {
            const edit = new vscode.WorkspaceEdit();
            const lastLine = open.lineAt(open.lineCount - 1);
            edit.replace(open.uri, new vscode.Range(0, 0, open.lineCount - 1, lastLine.text.length), content);
            await vscode.workspace.applyEdit(edit);
            await open.save();
            return false;
        }

        const isNew = !fs.existsSync(target);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content, 'utf8');
        return isNew;
    }

    /**
     * Restore some files of a snapshot; the current state is saved first
     */
    async restore(sketch, snapshot, files) {
        const date = this.formatDate(snapshot.created);
        const button = this.t('snapshot.restoreButton');
        const question = files.length === 1 && snapshot.files.length > 1
            ? this.t('snapshot.restoreFileConfirm', files[0], date)
            : this.t('snapshot.restoreConfirm', date);
        const answer = await vscode.window.showWarningMessage(question, { modal: true }, button);
        if (answer !== button) return;

        try {
            this.createSnapshot(sketch, this.t('snapshot.autoNote', date));
            let newFiles = 0;
            for (const file of files) {
                if (await this.restoreFile(snapshot, file, sketch.folder)) newFiles++;
            }
            vscode.window.showInformationMessage(newFiles > 0
                ? this.t('snapshot.restoredNew', files.length)
                : this.t('snapshot.restored', files.length));
        } catch (error) {
            vscode.window.showErrorMessage(this.t('snapshot.failed', error.message));
        }
    }

    /**
     * Pick one file of a snapshot
     */
    async pickFile(snapshot, placeHolder) {
        if (snapshot.files.length === 1) return snapshot.files[0];
        const selected = await vscode.window.showQuickPick(
            snapshot.files.map(file => ({ label: file })),
            { placeHolder }
        );
        return selected ? selected.label : null;
    }

    /**
     * Show a file of the snapshot next to the current one
     */
    async compare(sketch, snapshot) {
        const file = await this.pickFile(snapshot, this.t('snapshot.pickFile'));
        if (!file) return;

        const oldUri = vscode.Uri.file(path.join(snapshot.dir, 'files', ...file.split('/')));
        const currentUri = vscode.Uri.file(path.join(sketch.folder, ...file.split('/')));
        const title = this.t('snapshot.diffTitle', file, this.formatDate(snapshot.created));

        try {
            if (!fs.existsSync(currentUri.fsPath)) throw new Error('missing');
            await vscode.commands.executeCommand('vscode.diff', oldUri, currentUri, title);
        } catch (error) {
            // No diff view: open the old version beside the editor
            const document = await vscode.workspace.openTextDocument(oldUri);
            await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Beside, preview: true });
        }
    }

    /**
     * Actions for one snapshot
     */
    async showSnapshotActions(sketch, snapshot) {
        const date = this.formatDate(snapshot.created);
        const actions = [
            { label: '↩️ ' + this.t('snapshot.restoreAll'), action: 'restoreAll' },
            { label: '📄 ' + this.t('snapshot.restoreFile'), action: 'restoreFile' },
            { label: '🔍 ' + this.t('snapshot.compare'), action: 'compare' },
            { label: '🗑️ ' + this.t('snapshot.delete'), action: 'delete' }
        ];
        const selected = await vscode.window.showQuickPick(actions, {
            placeHolder: this.t('snapshot.actionPlaceholder', date) + (snapshot.note ? ` – ${snapshot.note}` : '')
        });
        if (!selected) return;

        if (selected.action === 'restoreAll') {
            await this.restore(sketch, snapshot, snapshot.files);
        } else if (selected.action === 'restoreFile') {
            const file = await this.pickFile(snapshot, this.t('snapshot.pickFile'));
            if (file) await this.restore(sketch, snapshot, [file]);
        } else if (selected.action === 'compare') {
            await this.compare(sketch, snapshot);
        } else if (selected.action === 'delete') {
            const button = this.t('snapshot.deleteButton');
            const answer = await vscode.window.showWarningMessage(
                this.t('snapshot.deleteConfirm', date), { modal: true }, button
            );
            if (answer === button) {
                fs.rmSync(snapshot.dir, { recursive: true, force: true });
                vscode.window.showInformationMessage(this.t('snapshot.deleted'));
            }
        }
    }

    /**
     * Main menu: create a snapshot or pick one
     */
    async showMenu() {
        const sketch = this.getSketch();
        if (!sketch) {
            vscode.window.showWarningMessage(this.t('common.noEditor'));
            return;
        }

        const snapshots = this.listSnapshots(sketch.name);
        const items = [
            { label: '➕ ' + this.t('snapshot.create'), detail: this.t('snapshot.createDetail'), create: true }
        ];
        if (snapshots.length > 0) {
            items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
        }
        for (const snapshot of snapshots) {
            const other = path.resolve(snapshot.sketchPath) !== path.resolve(sketch.folder);
            items.push({
                label: '🕒 ' + this.formatDate(snapshot.created),
                description: this.t('snapshot.files', snapshot.files.length) + (other ? ' · ' + this.t('snapshot.otherFolder') : ''),
                detail: snapshot.note || undefined,
                snapshot
            });
        }

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: this.t('snapshot.menuPlaceholder', sketch.name),
            matchOnDetail: true
        });
        if (!selected) return;

        if (selected.create) {
            const note = await vscode.window.showInputBox({
                prompt: this.t('snapshot.notePrompt'),
                placeHolder: this.t('snapshot.notePlaceholder')
            });
            // Escape cancels, an empty note is fine
            if (note === undefined) return;
            try {
                const snapshot = this.createSnapshot(sketch, note.trim());
                vscode.window.showInformationMessage(this.t('snapshot.created', snapshot.files.length));
            } catch (error) {
                vscode.window.showErrorMessage(this.t('snapshot.failed', error.message));
            }
        } else {
            await this.showSnapshotActions(sketch, selected.snapshot);
        }
    }
}

module.exports = { SnapshotManager };
