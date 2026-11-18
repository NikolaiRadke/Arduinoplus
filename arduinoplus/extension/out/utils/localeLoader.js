/*
 * Arduino+ - Locale Loader
 * Copyright 2026 Monster Maker
 * 
 * Licensed under the Apache License, Version 2.0
 */

"use strict";

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', '..', 'locales');

let translations = {};
let fallback = {};
let currentLocale = 'en';

/**
 * Read a locale file, returns an empty object on errors
 * @param {string} locale - e.g. "de"
 * @returns {Object}
 */
function readLocale(locale) {
    const file = path.join(LOCALES_DIR, `${locale}.json`);
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        return {};
    }
}

/**
 * Load translations based on the IDE language
 * Missing keys fall back to English
 */
function loadTranslations() {
    // "de-DE" -> "de"
    currentLocale = (vscode.env.language || 'en').split('-')[0].toLowerCase();
    fallback = readLocale('en');
    translations = currentLocale === 'en' ? fallback : readLocale(currentLocale);
    if (Object.keys(translations).length === 0) {
        translations = fallback;
        currentLocale = 'en';
    }
}

/**
 * Get translated string with parameter replacement
 * @param {string} key - Translation key
 * @param {...any} args - Arguments for placeholders {0}, {1}, ...
 * @returns {string} Translated string or key if not found
 */
function t(key, ...args) {
    let text = translations[key] || fallback[key] || key;
    args.forEach((arg, index) => {
        text = text.split(`{${index}}`).join(String(arg));
    });
    return text;
}

/**
 * Get current locale code
 * @returns {string} e.g. "de"
 */
function getCurrentLocale() {
    return currentLocale;
}

module.exports = {
    loadTranslations,
    t,
    getCurrentLocale
};
