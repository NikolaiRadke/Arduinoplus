/*
 * Arduino+ - Number Converter Module
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 */

"use strict";

const vscode = require('vscode');

// 0xC8, 0b11001000, B11001000 (Arduino binary.h), 200 - with ' separators and U/L suffixes
const NUMBER_TOKEN = /(?<![\w.])(0[xX][0-9a-fA-F']+|0[bB][01']+|B[01]{1,8}|\d[\d']*)([uU]?[lL]{0,2}|[lL]{1,2}[uU]?)(?![\w.])/g;

/**
 * Parse a number literal
 * @param {string} text - e.g. "0xC8", "0b1010", "B1010", "200UL"
 * @returns {{value: bigint, format: string, suffix: string}|null}
 */
function parseNumber(text) {
    const match = String(text).trim().match(/^(0[xX][0-9a-fA-F']+|0[bB][01']+|B[01]{1,8}|\d[\d']*)([uU]?[lL]{0,2}|[lL]{1,2}[uU]?)$/);
    if (!match) return null;

    const literal = match[1].replace(/'/g, '');
    let value;
    let format;
    if (/^0[xX]/.test(literal)) {
        value = BigInt('0x' + literal.slice(2));
        format = 'hex';
    } else if (/^0[bB]/.test(literal)) {
        value = BigInt('0b' + literal.slice(2));
        format = 'bin';
    } else if (literal.startsWith('B')) {
        value = BigInt('0b' + literal.slice(1));
        format = 'arduino';
    } else {
        // Leading zeros in C mean octal, but nobody uses that in sketches
        value = BigInt(literal);
        format = 'dec';
    }
    return { value, format, suffix: match[2] || '' };
}

/**
 * Smallest width in bits that holds the value
 * @param {bigint} value
 * @returns {number} 8, 16, 32 or 64
 */
function bitWidth(value) {
    for (const bits of [8, 16, 32]) {
        if (value < (1n << BigInt(bits))) return bits;
    }
    return 64;
}

/**
 * All representations of a value
 * @param {bigint} value
 * @param {string} suffix - U/L suffix to keep
 * @returns {Array<{format: string, text: string, bits: number|null}>}
 */
function formatNumber(value, suffix = '') {
    const minBits = bitWidth(value);
    const hex = value.toString(16).toUpperCase();
    const bin = value.toString(2);
    const result = [{ format: 'dec', text: value.toString() + suffix, bits: null }];

    for (const bits of [8, 16, 32, 64]) {
        if (bits < minBits || (bits === 64 && minBits < 64)) continue;
        result.push({ format: 'hex', text: '0x' + hex.padStart(bits / 4, '0') + suffix, bits });
    }
    for (const bits of [8, 16, 32, 64]) {
        if (bits < minBits || (bits === 64 && minBits < 64)) continue;
        result.push({ format: 'bin', text: '0b' + bin.padStart(bits, '0') + suffix, bits });
    }
    if (value <= 255n) {
        result.push({ format: 'arduino', text: 'B' + bin.padStart(8, '0'), bits: 8 });
    }
    if (value >= 32n && value <= 126n) {
        const char = String.fromCharCode(Number(value));
        result.push({ format: 'char', text: char === '\'' || char === '\\' ? `'\\${char}'` : `'${char}'`, bits: null });
    }
    return result;
}

/**
 * Find the number literal at a position in a line
 * @param {string} lineText
 * @param {number} character - Cursor column
 * @returns {{start: number, end: number, text: string}|null}
 */
function findNumberAt(lineText, character) {
    NUMBER_TOKEN.lastIndex = 0;
    let match;
    while ((match = NUMBER_TOKEN.exec(lineText)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (character >= start && character <= end) {
            return { start, end, text: match[0] };
        }
    }
    return null;
}

/**
 * Convert the selected number or the number at the cursor
 * @param {Function} t - Translation function
 */
async function convertNumber(t) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage(t('common.noEditor'));
        return;
    }

    let range;
    let text;
    if (!editor.selection.isEmpty) {
        range = new vscode.Range(editor.selection.start, editor.selection.end);
        text = editor.document.getText(range);
    } else {
        const position = editor.selection.active;
        const found = findNumberAt(editor.document.lineAt(position.line).text, position.character);
        if (found) {
            range = new vscode.Range(position.line, found.start, position.line, found.end);
            text = found.text;
        }
    }

    const parsed = text ? parseNumber(text) : null;
    if (!parsed) {
        vscode.window.showInformationMessage(t('convert.noNumber'));
        return;
    }

    const current = text.trim();
    const items = formatNumber(parsed.value, parsed.suffix)
        .filter(option => option.text !== current)
        .map(option => ({
            label: option.text,
            description: t('convert.' + option.format) + (option.bits ? ' · ' + t('convert.bits', option.bits) : ''),
            text: option.text
        }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: t('convert.placeholder', current)
    });
    if (!selected) return;

    // Keep spaces around a selected number
    const lead = text.match(/^\s*/)[0];
    const trail = text.match(/\s*$/)[0];
    await editor.edit(editBuilder => {
        editBuilder.replace(range, lead + selected.text + trail);
    });
}

module.exports = {
    convertNumber,
    parseNumber,
    formatNumber,
    findNumberAt
};
