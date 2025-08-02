import { initFileExplorer } from './fileExplorer.js';
import { initEditor } from './editor.js';
import { initChat } from './chat.js';
import { initCollapsibles, initMenuBar, initContextMenu } from './ui.js';
import { initBottomPanel } from './panel.js';
import { initRunServer } from './run.js'; // [신규]

document.addEventListener('DOMContentLoaded', () => {
    initMenuBar();
    initCollapsibles();
    initContextMenu();
    initBottomPanel();
    initFileExplorer();
    initEditor();
    initChat();
    initRunServer(); // [신규]
});