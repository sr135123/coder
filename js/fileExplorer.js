import { state } from './state.js';
import { showContextMenu } from './ui.js';
import { openFile, closeFile } from './editor.js';

const fileTreeListEl = document.getElementById('file-tree-list');
let selectedExplorerItem = { element: null, node: null };
let checkedFiles = new Set();
const contextFileCountEl = document.getElementById('context-file-count');

// --- 액션 핸들러들 ---

function handleRename() {
    if (!selectedExplorerItem.element) return;
    const { element, node } = selectedExplorerItem;
    const nameSpan = element.querySelector('.item-name');
    enterEditMode(element, nameSpan, node);
}

async function handleDelete() {
    if (!selectedExplorerItem.node) return;
    const { node } = selectedExplorerItem;
    
    try {
        let content = null;
        if (node.kind === 'file') {
            const file = await node.handle.getFile();
            content = await file.text();
            state.undoStack.push({ type: 'delete', name: node.name, content: content, parentHandle: node.parentHandle });
        } else {
            console.warn("Undo for folder deletion is not supported.");
        }

        await node.parentHandle.removeEntry(node.name, { recursive: node.kind === 'directory' });
        
        for (const [handle] of state.openFiles.entries()) {
            if (await handle.isSameEntry(node.handle)) {
                closeFile(handle, true);
                break;
            }
        }
        await refreshFileTree();
        selectedExplorerItem = { element: null, node: null };
    } catch (err) {
        alert(`Failed to delete: ${err.message}`);
    }
}

function handleCopy() {
    if (!selectedExplorerItem.node) return;
    state.clipboard = { type: 'copy', node: selectedExplorerItem.node };
    console.log(`Copied '${selectedExplorerItem.node.name}' to clipboard.`);
}

async function handlePaste() {
    if (!state.clipboard) return;
    const { node: sourceNode } = state.clipboard;
    
    let targetDirHandle = state.directoryHandle;
    if (selectedExplorerItem.node) {
        targetDirHandle = selectedExplorerItem.node.kind === 'directory' ? selectedExplorerItem.node.handle : selectedExplorerItem.node.parentHandle;
    }

    try {
        let newName = sourceNode.name;
        const existingNames = (await getDirectoryEntries(targetDirHandle)).map(e => e.name);
        while (existingNames.includes(newName)) {
            const parts = newName.split('.');
            const ext = parts.length > 1 ? '.' + parts.pop() : '';
            const baseName = parts.join('.');
            newName = `${baseName} - copy${ext}`;
        }
        
        await copyEntry(sourceNode.handle, targetDirHandle, newName);
        
        state.undoStack.push({ type: 'create', name: newName, kind: sourceNode.kind, parentHandle: targetDirHandle });
        await refreshFileTree();
    } catch (err) {
        alert(`Paste failed: ${err.message}`);
    }
}

async function handleUndo() {
    if (state.undoStack.length === 0) return;
    const lastAction = state.undoStack.pop();

    try {
        switch (lastAction.type) {
            case 'delete':
                const restoredFile = await lastAction.parentHandle.getFileHandle(lastAction.name, { create: true });
                const writable = await restoredFile.createWritable();
                await writable.write(lastAction.content);
                await writable.close();
                break;
            case 'create':
                await lastAction.parentHandle.removeEntry(lastAction.name, { recursive: lastAction.kind === 'directory' });
                break;
            case 'rename':
                const fileToRename = await lastAction.parentHandle.getFileHandle(lastAction.newName, { create: false });
                const content = await (await fileToRename.getFile()).text();
                const originalFile = await lastAction.parentHandle.getFileHandle(lastAction.oldName, { create: true });
                const originalWritable = await originalFile.createWritable();
                await originalWritable.write(content);
                await originalWritable.close();
                await lastAction.parentHandle.removeEntry(lastAction.newName);
                break;
        }
        await refreshFileTree();
    } catch (err) {
        console.error("Undo failed:", err);
        alert(`Undo failed: ${err.message}`);
    }
}

async function handleOpenFolder() {
    try {
        const handle = await window.showDirectoryPicker();
        state.directoryHandle = handle;
        state.undoStack = [];
        document.getElementById('folder-name').textContent = handle.name.toUpperCase();
        await refreshFileTree();
    } catch (err) {
        console.error('Folder open cancelled or failed:', err);
    }
}

// --- 유틸리티 및 UI 렌더링 함수들 ---
export async function getCheckedFilePaths() {
    const fileInfos = [];
    const findFile = async (dirHandle, pathParts) => {
        let currentHandle = dirHandle;
        for (let i = 0; i < pathParts.length - 1; i++) {
            currentHandle = await currentHandle.getDirectoryHandle(pathParts[i]);
        }
        return await currentHandle.getFileHandle(pathParts[pathParts.length-1]);
    };
    for (const path of checkedFiles) {
        try {
            const pathParts = path.split('/');
            const fileHandle = await findFile(state.directoryHandle, pathParts);
            if(fileHandle) {
                const file = await fileHandle.getFile();
                const content = await file.text();
                fileInfos.push({ path, content });
            }
        } catch(e) { console.error(`Could not get content for ${path}`, e)}
    }
    return fileInfos;
}

async function getDirectoryEntries(dirHandle) {
    const entries = [];
    for await (const entry of dirHandle.values()) {
        entries.push(entry);
    }
    return entries;
}

async function copyEntry(sourceHandle, targetDirHandle, newName) {
    if (sourceHandle.kind === 'file') {
        const file = await sourceHandle.getFile();
        const newFileHandle = await targetDirHandle.getFileHandle(newName, { create: true });
        const writable = await newFileHandle.createWritable();
        await writable.write(file);
        await writable.close();
    } else if (sourceHandle.kind === 'directory') {
        const newDirHandle = await targetDirHandle.getDirectoryHandle(newName, { create: true });
        for await (const entry of sourceHandle.values()) {
            await copyEntry(entry, newDirHandle, entry.name);
        }
    }
}

export function renderFileTree() {
    if (!state.fileTree) {
        fileTreeListEl.innerHTML = '<p class="placeholder-text">You have not yet opened a folder.</p>';
        return;
    }
    const oldSelectionName = selectedExplorerItem.node?.name;
    const oldSelectionParentName = selectedExplorerItem.node?.parentHandle.name;
    
    fileTreeListEl.innerHTML = '';
    const ul = document.createElement('ul');
    state.fileTree.children.forEach(child => createTreeDOM(child, ul));
    fileTreeListEl.appendChild(ul);
    
    if (oldSelectionName) {
        const selectedNode = findNodeInTree(oldSelectionName, state.fileTree.children, false, oldSelectionParentName);
        if (selectedNode) {
            const liToSelect = Array.from(fileTreeListEl.querySelectorAll('.item-name')).find(span => span.textContent === oldSelectionName);
            if (liToSelect) {
                const parentLi = liToSelect.closest('li');
                if (selectedExplorerItem.element) selectedExplorerItem.element.classList.remove('selected');
                parentLi.classList.add('selected');
                selectedExplorerItem = { element: parentLi, node: selectedNode };
            }
        }
    }
}

function findNodeInTree(name, children, findDirectoryOnly = false, parentName = null) {
    for (const child of children) {
        if (findDirectoryOnly && child.kind !== 'directory') continue;
        if (child.name === name) {
            if (parentName && child.parentHandle.name !== parentName) continue;
            return child;
        }
        if (child.children) {
            const found = findNodeInTree(name, child.children, findDirectoryOnly, parentName);
            if (found) return found;
        }
    }
    return null;
}

function createTreeDOM(treeNode, parentEl, path = '') {
    const currentPath = path ? `${path}/${treeNode.name}` : treeNode.name;
    const li = document.createElement('li');
    li.tabIndex = -1;

    const nameWrapper = document.createElement('div');
    nameWrapper.className = 'item-name-wrapper';

    if (treeNode.kind === 'file') {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'context-checkbox';
        checkbox.checked = checkedFiles.has(currentPath);
        checkbox.addEventListener('click', (e) => e.stopPropagation());
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                checkedFiles.add(currentPath);
            } else {
                checkedFiles.delete(currentPath);
            }
            contextFileCountEl.textContent = `${checkedFiles.size} files in context`;
        });
        nameWrapper.appendChild(checkbox);
    }
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'item-name';
    nameSpan.textContent = treeNode.name;
    nameWrapper.appendChild(nameSpan);
    li.appendChild(nameWrapper);

    const ext = treeNode.kind === 'file' ? treeNode.name.split('.').pop() : '';
    li.classList.add(treeNode.kind);
    if (ext) li.classList.add(ext);

    if (treeNode.kind === 'directory') {
        const ul = document.createElement('ul');
        treeNode.children.forEach(child => createTreeDOM(child, ul, currentPath));
        li.appendChild(ul);
    }
    
    const selectItem = () => {
        if (selectedExplorerItem.element) {
            selectedExplorerItem.element.classList.remove('selected');
            selectedExplorerItem.element.classList.remove('focused');
        }
        li.classList.add('selected');
        li.focus();
        selectedExplorerItem = { element: li, node: treeNode };
    };

    li.addEventListener('click', (e) => {
        e.stopPropagation();
        selectItem();
        if (treeNode.kind === 'file') openFile(treeNode.handle);
    });
    
    li.addEventListener('focus', () => {
        if(selectedExplorerItem.element) selectedExplorerItem.element.classList.remove('focused');
        li.classList.add('focused');
    });

    li.addEventListener('blur', () => {
        li.classList.remove('focused');
    });
    
    li.addEventListener('dblclick', (e) => { e.stopPropagation(); handleRename(); });
    li.addEventListener('contextmenu', (e) => { selectItem(); showContextMenu(e, treeNode); });

    parentEl.appendChild(li);
}

function enterEditMode(li, nameSpan, treeNode) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'file-tree-input';
    input.value = treeNode.name;
    
    li.querySelector('.item-name-wrapper').replaceChild(input, nameSpan);
    input.focus();
    input.select();

    const finishEdit = async (isCancelled = false) => {
        const newName = input.value.trim();
        li.querySelector('.item-name-wrapper').replaceChild(nameSpan, input);

        if (isCancelled || newName === treeNode.name || newName === '') return;
        await performRename(treeNode, newName);
    };

    input.addEventListener('blur', () => finishEdit());
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishEdit();
        else if (e.key === 'Escape') finishEdit(true);
    });
}

async function performRename(treeNode, newName) {
    if (treeNode.kind === 'directory') {
        alert("Folder renaming is not yet supported.");
        return;
    }
    
    try {
        const parentHandle = treeNode.parentHandle;
        
        await copyEntry(treeNode.handle, parentHandle, newName);
        await parentHandle.removeEntry(treeNode.name);

        state.undoStack.push({ type: 'rename', oldName: treeNode.name, newName: newName, parentHandle: parentHandle });

        for (const [handle] of state.openFiles.entries()) {
            if (await handle.isSameEntry(treeNode.handle)) {
                closeFile(handle, true);
                alert(`'${treeNode.name}' was renamed to '${newName}'. The tab has been closed.`);
                break;
            }
        }
        selectedExplorerItem.node.name = newName;
        await refreshFileTree();
    } catch (err) {
        console.error("Error renaming file:", err);
        alert(`Failed to rename file: ${err.message}`);
        await refreshFileTree();
    }
}

async function refreshFileTree() {
    if (!state.directoryHandle) return;

    async function processDirectory(dirHandle, parentHandle) {
        const children = [];
        for await (const entry of dirHandle.values()) {
            const node = { name: entry.name, kind: entry.kind, handle: entry, parentHandle: dirHandle };
            if (entry.kind === 'directory') {
                node.children = await processDirectory(entry, entry);
            }
            children.push(node);
        }
        children.sort((a, b) => {
            if (a.kind === b.kind) return a.name.localeCompare(b.name);
            return a.kind === 'directory' ? -1 : 1;
        });
        return children;
    }
    
    state.fileTree = {
        name: state.directoryHandle.name,
        kind: 'directory',
        handle: state.directoryHandle,
        children: await processDirectory(state.directoryHandle, state.directoryHandle)
    };
    renderFileTree();
}

function createNewEntryUI(type, event) {
    event.stopPropagation();
    if (!state.directoryHandle) { alert("Please open a folder first."); return; }
    
    let targetDirHandle = state.directoryHandle;
    let listRoot = fileTreeListEl.querySelector('ul');
    
    if (selectedExplorerItem.node) {
        targetDirHandle = selectedExplorerItem.node.kind === 'directory' ? selectedExplorerItem.node.handle : selectedExplorerItem.node.parentHandle;
        listRoot = selectedExplorerItem.element.closest('ul');
    }

    if (!listRoot) {
        fileTreeListEl.innerHTML = '';
        listRoot = document.createElement('ul');
        fileTreeListEl.appendChild(listRoot);
    }
    
    const li = document.createElement('li');
    li.classList.add(type);
    const nameWrapper = document.createElement('div');
    nameWrapper.className = 'item-name-wrapper';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'file-tree-input';
    nameWrapper.appendChild(input)
    li.appendChild(nameWrapper);
    listRoot.prepend(li);
    input.focus();

    const finishCreation = async (isCancelled = false) => {
        const name = input.value.trim();
        li.remove();
        if (isCancelled || name === '') return;

        const existingEntries = await getDirectoryEntries(targetDirHandle);
        if (existingEntries.some(entry => entry.name === name)) {
            alert(`An entry named '${name}' already exists in this directory.`);
            return;
        }

        try {
            if (type === 'file') {
                await targetDirHandle.getFileHandle(name, { create: true });
            } else {
                await targetDirHandle.getDirectoryHandle(name, { create: true });
            }
            state.undoStack.push({ type: 'create', name: name, kind: type, parentHandle: targetDirHandle });
            await refreshFileTree();
        } catch (err) {
            console.error(`Error creating ${type}:`, err);
            alert(`Failed to create ${type}: ${err.message}`);
        }
    };

    input.addEventListener('blur', () => finishCreation());
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishCreation();
        else if (e.key === 'Escape') finishCreation(true);
    });
}

// --- 초기화 함수 ---

export function initFileExplorer() {
    window.addEventListener('app:open-folder', handleOpenFolder);
    window.addEventListener('app:rename', handleRename);
    window.addEventListener('app:delete', handleDelete);
    window.addEventListener('app:copy', handleCopy);
    window.addEventListener('app:paste', handlePaste);

    const newFileBtn = document.getElementById('new-file-btn');
    const newFolderBtn = document.getElementById('new-folder-btn');
    const refreshBtn = document.getElementById('refresh-btn');

    newFileBtn.addEventListener('click', (e) => createNewEntryUI('file', e));
    newFolderBtn.addEventListener('click', (e) => createNewEntryUI('folder', e));
    refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        refreshFileTree();
    });

    fileTreeListEl.setAttribute('tabindex', '-1'); 
    fileTreeListEl.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            handleUndo();
            return;
        }
        
        if (!selectedExplorerItem.element) return;
        switch (e.key) {
            case 'F2': e.preventDefault(); handleRename(); break;
            case 'Delete': e.preventDefault(); handleDelete(); break;
        }
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'c': e.preventDefault(); handleCopy(); break;
                case 'v': e.preventDefault(); handlePaste(); break;
            }
        }
    });

    fileTreeListEl.addEventListener('click', (e) => {
        if (e.target === fileTreeListEl && selectedExplorerItem.element) {
            selectedExplorerItem.element.classList.remove('selected');
            selectedExplorerItem.element.classList.remove('focused');
            selectedExplorerItem = { element: null, node: null };
        } else if (!e.target.closest('li')) {
            fileTreeListEl.focus();
        }
    });

    renderFileTree();
}