import { state } from './state.js';

let contextMenuEl = null;
let contextTargetNode = null;

export function initCollapsibles() {
    document.querySelectorAll('.collapsible').forEach(header => {
        header.addEventListener('click', () => {
            header.classList.toggle('active');
        });
    });
}

export function initMenuBar() {
    const menuItems = document.querySelectorAll('.menu-item');

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = item.querySelector('.dropdown-menu');
            if (!dropdown) return;
            const isActive = item.classList.contains('active');
            closeAllDropdowns();
            if (!isActive) {
                item.classList.add('active');
                dropdown.classList.add('visible');
            }
        });
    });

    window.addEventListener('click', closeAllDropdowns);

    document.getElementById('menu-open-folder').addEventListener('click', () => window.dispatchEvent(new CustomEvent('app:open-folder')));
    document.getElementById('menu-save-file').addEventListener('click', () => window.dispatchEvent(new CustomEvent('app:save-file')));
}

function closeAllDropdowns() {
    document.querySelectorAll('.menu-item.active').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.dropdown-menu.visible').forEach(menu => menu.classList.remove('visible'));
}

export function initContextMenu() {
    contextMenuEl = document.getElementById('context-menu');

    document.getElementById('ctx-rename').addEventListener('click', () => {
        if (contextTargetNode) window.dispatchEvent(new CustomEvent('app:rename'));
        hideContextMenu();
    });
    document.getElementById('ctx-delete').addEventListener('click', () => {
        if (contextTargetNode) window.dispatchEvent(new CustomEvent('app:delete'));
        hideContextMenu();
    });
    document.getElementById('ctx-copy').addEventListener('click', () => {
        if (contextTargetNode) window.dispatchEvent(new CustomEvent('app:copy'));
        hideContextMenu();
    });
    document.getElementById('ctx-paste').addEventListener('click', () => {
        if (!state.clipboard) return;
        window.dispatchEvent(new CustomEvent('app:paste'));
        hideContextMenu();
    });

    window.addEventListener('click', hideContextMenu);
    window.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('#file-explorer')) {
            hideContextMenu();
        }
    });
}

export function showContextMenu(event, treeNode) {
    event.preventDefault();
    event.stopPropagation();
    
    contextTargetNode = treeNode;
    
    const pasteItem = document.getElementById('ctx-paste');
    if (state.clipboard) {
        pasteItem.classList.remove('disabled');
    } else {
        pasteItem.classList.add('disabled');
    }
    
    contextMenuEl.style.top = `${event.clientY}px`;
    contextMenuEl.style.left = `${event.clientX}px`;
    contextMenuEl.classList.add('visible');
}

function hideContextMenu() {
    if (contextMenuEl) contextMenuEl.classList.remove('visible');
    contextTargetNode = null;
}