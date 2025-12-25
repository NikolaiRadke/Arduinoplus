/*
 * Arduino+ - Snippet Manager Module
 * Copyright 2025 Monster Maker
 * 
 * Licensed under the Apache License, Version 2.0
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ARDUINOPLUS_DIR = path.join(os.homedir(), '.arduinoplus');
const SNIPPETS_FILE = path.join(ARDUINOPLUS_DIR, 'snippets.json');

/**
 * Snippet Manager - handles storage and retrieval of code snippets
 * Uses file-based storage in ~/.arduinoplus/snippets.json
 */
class SnippetManager {
    constructor() {
        this.snippets = [];
        this.ensureDirectory();
        this.loadSnippets();
    }

    /**
     * Ensure .arduinoplus directory exists
     */
    ensureDirectory() {
        if (!fs.existsSync(ARDUINOPLUS_DIR)) {
            try {
                fs.mkdirSync(ARDUINOPLUS_DIR, { recursive: true });
            } catch (error) {
                console.error('Failed to create .arduinoplus directory:', error);
            }
        }
    }

    /**
     * Load snippets from file
     */
    loadSnippets() {
        if (!fs.existsSync(SNIPPETS_FILE)) {
            this.snippets = [];
            return;
        }

        try {
            const data = fs.readFileSync(SNIPPETS_FILE, 'utf8');
            this.snippets = JSON.parse(data);
        } catch (error) {
            console.error('Failed to load snippets:', error);
            this.snippets = [];
        }
    }

    /**
     * Save snippets to file (atomic write for safety)
     */
    saveSnippets() {
        try {
            // Atomic write pattern from fileManager.js
            const tempFile = SNIPPETS_FILE + '.tmp';
            const data = JSON.stringify(this.snippets, null, 2);
            
            // Write to temp file first
            fs.writeFileSync(tempFile, data, 'utf8');
            
            // Atomic rename
            fs.renameSync(tempFile, SNIPPETS_FILE);
            
            return true;
        } catch (error) {
            console.error('Failed to save snippets:', error);
            
            // Cleanup temp file if it exists
            const tempFile = SNIPPETS_FILE + '.tmp';
            if (fs.existsSync(tempFile)) {
                try {
                    fs.unlinkSync(tempFile);
                } catch {}
            }
            
            return false;
        }
    }

    /**
     * Add a new snippet
     * @param {string} content - The snippet content
     * @returns {object} The created snippet
     */
    addSnippet(content) {
        const snippet = {
            id: Date.now(),
            name: `Snippet ${this.snippets.length + 1}`,
            content: content,
            created: new Date().toISOString()
        };
        
        this.snippets.push(snippet);
        this.saveSnippets();
        return snippet;
    }

    /**
     * Get all snippets
     * @returns {Array} All snippets
     */
    getAllSnippets() {
        return this.snippets;
    }

    /**
     * Delete a snippet by ID
     * @param {number} id - Snippet ID
     */
    deleteSnippet(id) {
        this.snippets = this.snippets.filter(s => s.id !== id);
        this.saveSnippets();
    }

    /**
     * Update snippet content
     * @param {number} id - Snippet ID
     * @param {string} content - New content
     */
    updateSnippet(id, content) {
        const snippet = this.snippets.find(s => s.id === id);
        if (snippet) {
            snippet.content = content;
            this.saveSnippets();
        }
    }
}

module.exports = { SnippetManager };
