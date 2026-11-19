/*
 * Arduino+ - Color Themes
 * Copyright 2026 Monster Maker
 *
 * Licensed under the Apache License, Version 2.0
 *
 * Builds complete color themes: own UI colors in Arduino style (teal accent)
 * plus syntax colors. The accessible themes use the Okabe-Ito palette, which
 * stays distinguishable for all common kinds of color blindness, and add bold
 * keywords and italic comments so color is not the only hint.
 */

"use strict";

const THEMES = {
    accessibleLight: { id: 'Arduino+ Barrierefrei hell', file: 'accessible-light.json', base: 'light' },
    accessibleDark: { id: 'Arduino+ Barrierefrei dunkel', file: 'accessible-dark.json', base: 'dark' },
    customLight: { id: 'Arduino+ Eigenes Schema hell', file: 'custom-light.json', base: 'light' },
    customDark: { id: 'Arduino+ Eigenes Schema dunkel', file: 'custom-dark.json', base: 'dark' }
};

// Syntax colors: Okabe-Ito hues, darkened on light background for contrast
const PALETTES = {
    light: {
        comment: '#6b6b6b', keyword: '#0072b2', type: '#00785a', function: '#b84f00',
        string: '#a0468a', number: '#8a6400', preprocessor: '#0072b2', text: '#1e1e1e'
    },
    dark: {
        comment: '#a0a0a0', keyword: '#56b4e9', type: '#2fc49b', function: '#e69f00',
        string: '#e08fc2', number: '#f0e442', preprocessor: '#56b4e9', text: '#e8e8e8'
    }
};

// Token groups that can be colored, in the order of the settings panel
const TOKEN_GROUPS = ['comment', 'keyword', 'type', 'function', 'string', 'number', 'preprocessor'];

/**
 * UI colors for the whole IDE (no colors are taken over from other themes)
 * @param {'light'|'dark'} base
 */
function uiColors(base) {
    const light = base === 'light';
    const accent = light ? '#00837f' : '#1fb5ad';
    const c = light ? {
        bg: '#ffffff', fg: '#1e1e1e', side: '#f3f6f6', bar: '#e6eded', border: '#d4dddd',
        muted: '#5f6b6b', hover: '#e8eeee', select: '#00837f33', input: '#ffffff'
    } : {
        bg: '#1e1f20', fg: '#e8e8e8', side: '#252627', bar: '#2c2e2f', border: '#3c3f41',
        muted: '#a6adad', hover: '#2f3233', select: '#1fb5ad40', input: '#2a2c2d'
    };
    return {
        'focusBorder': accent,
        'foreground': c.fg,
        'descriptionForeground': c.muted,
        'errorForeground': light ? '#c4262e' : '#f48771',
        'editor.background': c.bg,
        'editor.foreground': c.fg,
        'editorLineNumber.foreground': c.muted,
        'editorLineNumber.activeForeground': c.fg,
        'editor.lineHighlightBackground': light ? '#00837f0d' : '#ffffff0d',
        'editor.selectionBackground': c.select,
        'editor.inactiveSelectionBackground': light ? '#00837f1f' : '#1fb5ad26',
        'editor.findMatchHighlightBackground': light ? '#f0e44280' : '#f0e44240',
        'editorCursor.foreground': accent,
        'editorWhitespace.foreground': c.border,
        'editorIndentGuide.background': c.border,
        'editorBracketMatch.border': accent,
        'editorWidget.background': c.side,
        'editorHoverWidget.background': c.side,
        'editorHoverWidget.border': c.border,
        'editorSuggestWidget.background': c.side,
        'editorSuggestWidget.selectedBackground': c.select,
        'editorGroupHeader.tabsBackground': c.bar,
        'editorGroup.border': c.border,
        'tab.activeBackground': c.bg,
        'tab.activeForeground': c.fg,
        'tab.inactiveBackground': c.bar,
        'tab.inactiveForeground': c.muted,
        'tab.border': c.border,
        'tab.activeBorderTop': accent,
        'activityBar.background': c.side,
        'activityBar.foreground': accent,
        'activityBar.inactiveForeground': c.muted,
        'activityBar.border': c.border,
        'activityBarBadge.background': accent,
        'activityBarBadge.foreground': '#ffffff',
        'sideBar.background': c.side,
        'sideBar.foreground': c.fg,
        'sideBar.border': c.border,
        'sideBarTitle.foreground': c.fg,
        'sideBarSectionHeader.background': c.bar,
        'sideBarSectionHeader.foreground': c.fg,
        'titleBar.activeBackground': c.bar,
        'titleBar.activeForeground': c.fg,
        'titleBar.inactiveBackground': c.bar,
        'titleBar.inactiveForeground': c.muted,
        'statusBar.background': accent,
        'statusBar.foreground': '#ffffff',
        'statusBar.noFolderBackground': accent,
        'statusBarItem.hoverBackground': '#ffffff26',
        'panel.background': c.bg,
        'panel.border': c.border,
        'panelTitle.activeForeground': c.fg,
        'panelTitle.activeBorder': accent,
        'panelTitle.inactiveForeground': c.muted,
        'button.background': accent,
        'button.foreground': '#ffffff',
        'button.hoverBackground': light ? '#006b68' : '#18948d',
        'button.secondaryBackground': c.bar,
        'button.secondaryForeground': c.fg,
        'button.secondaryHoverBackground': c.hover,
        'input.background': c.input,
        'input.foreground': c.fg,
        'input.border': c.border,
        'input.placeholderForeground': c.muted,
        'dropdown.background': c.input,
        'dropdown.foreground': c.fg,
        'dropdown.border': c.border,
        'checkbox.background': c.input,
        'checkbox.border': c.border,
        'badge.background': accent,
        'badge.foreground': '#ffffff',
        'list.activeSelectionBackground': c.select,
        'list.activeSelectionForeground': c.fg,
        'list.inactiveSelectionBackground': c.hover,
        'list.hoverBackground': c.hover,
        'list.highlightForeground': accent,
        'list.focusOutline': accent,
        'menu.background': c.side,
        'menu.foreground': c.fg,
        'menu.selectionBackground': c.select,
        'menu.selectionForeground': c.fg,
        'menu.separatorBackground': c.border,
        'quickInput.background': c.side,
        'quickInput.foreground': c.fg,
        'quickInputList.focusBackground': c.select,
        'notifications.background': c.side,
        'notifications.foreground': c.fg,
        'notifications.border': c.border,
        'scrollbarSlider.background': light ? '#00000026' : '#ffffff26',
        'scrollbarSlider.hoverBackground': light ? '#00000040' : '#ffffff40',
        'scrollbarSlider.activeBackground': light ? '#00000059' : '#ffffff59',
        'progressBar.background': accent,
        'textLink.foreground': accent,
        'textLink.activeForeground': accent,
        'textCodeBlock.background': c.side,
        'terminal.background': c.bg,
        'terminal.foreground': c.fg
    };
}

/**
 * Syntax rules for the TextMate scopes of the Arduino IDE C++ grammar
 * @param {Object} colors - Color per token group
 * @param {boolean} styled - Bold keywords and italic comments
 */
function tokenColors(colors, styled) {
    const rule = (scope, color, fontStyle) => ({ scope, settings: { foreground: color, ...(fontStyle ? { fontStyle } : {}) } });
    return [
        { settings: { foreground: colors.text } },
        rule(['variable', 'variable.name', 'variable.other', 'punctuation', 'meta.block'], colors.text),
        rule(['storage', 'storage.type', 'storage.modifier', 'support.type', 'support.class', 'entity.name.type',
            'string.quoted.single.c'], colors.type, styled ? 'bold' : ''),
        rule(['entity.name.function', 'support.function', 'meta.function-call.c', 'meta.function-call'], colors.function),
        rule(['string', 'string.quoted.double', 'string.quoted.single', 'string.quoted.other.lt-gt'], colors.string),
        rule(['constant', 'constant.numeric', 'constant.language', 'constant.character'], colors.number),
        rule(['keyword', 'keyword.control', 'keyword.operator.new', 'keyword.operator.sizeof'], colors.keyword, styled ? 'bold' : ''),
        rule(['meta.preprocessor', 'meta.preprocessor.c', 'keyword.control.directive', 'entity.name.function.preprocessor',
            'entity.name.function.preprocessor.c', 'meta.preprocessor.macro.c', 'punctuation.definition.directive'], colors.preprocessor),
        rule(['comment', 'punctuation.definition.comment'], colors.comment, styled ? 'italic' : '')
    ];
}

/**
 * Complete theme
 * @param {string} name
 * @param {'light'|'dark'} base
 * @param {Object} [colors] - Syntax colors, default: accessible palette
 * @param {boolean} [styled] - Bold keywords and italic comments
 */
function buildTheme(name, base, colors, styled = true) {
    const syntax = { ...PALETTES[base], ...(colors || {}) };
    return {
        name,
        type: base,
        colors: uiColors(base),
        tokenColors: tokenColors(syntax, styled)
    };
}

module.exports = {
    THEMES,
    PALETTES,
    TOKEN_GROUPS,
    buildTheme
};
