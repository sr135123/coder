import { state } from './state.js';

const editorContainer = document.getElementById('editor-container');
const tabsContainer = document.getElementById('tabs-container');
const welcomeMessage = document.querySelector('.welcome-message');
const statusLangEl = document.getElementById('status-lang');
const statusCursorEl = document.getElementById('status-cursor');
const openEditorsListEl = document.getElementById('open-editors-list');

export async function applyCodeModification(fileName, mod, action) {
    let targetHandle = null;
    let fileData = null;

    // 열린 파일 중에서 찾기
    for (const [handle, data] of state.openFiles.entries()) {
        if (data.name === fileName) {
            targetHandle = handle;
            fileData = data;
            break;
        }
    }
    
    // 열려있지 않다면 파일 시스템에서 재귀적으로 찾기
    if (!targetHandle && state.directoryHandle) {
        const findHandleInDir = async (dirHandle, name) => {
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file' && entry.name === name) return entry;
                if (entry.kind === 'directory') {
                    const found = await findHandleInDir(entry, name);
                    if (found) return found;
                }
            }
            return null;
        };
        targetHandle = await findHandleInDir(state.directoryHandle, fileName);
        if (targetHandle) {
            await openFile(targetHandle); // 파일 열기
            // openFile이 비동기이므로, state.openFiles에서 다시 찾아야 함
            for (const [h, d] of state.openFiles.entries()) {
                if (await h.isSameEntry(targetHandle)) {
                    fileData = d;
                    break;
                }
            }
        }
    }

    if (!fileData || !fileData.model) {
        throw new Error(`File '${fileName}' not found or not opened.`);
    }

    let editOperation;

    if (action === 'add' && mod.lineNumber === 'EOF') {
        const lineCount = fileData.model.getLineCount();
        const lastLineContent = fileData.model.getLineContent(lineCount);
        editOperation = {
            range: new monaco.Range(lineCount, lastLineContent.length + 1, lineCount, lastLineContent.length + 1),
            text: (fileData.model.getValue().endsWith('\n') ? '' : '\n') + mod.text
        };
    } else if (action === 'add') {
         editOperation = {
            range: new monaco.Range(mod.lineNumber, 1, mod.lineNumber, 1),
            text: mod.text,
        };
    } else { // remove
        editOperation = {
            range: mod.range,
            text: ''
        };
    }

    // Monaco Editor 모델 수정
    fileData.model.pushEditOperations(
        [], // 이전 선택 영역 (없음)
        [editOperation], // 적용할 수정 사항
        () => null // 이후 선택 영역 (없음)
    );
}

function renderOpenEditors() {
    openEditorsListEl.innerHTML = '';
    if (state.openFiles.size === 0) {
        openEditorsListEl.innerHTML = '<div style="padding: 5px 10px; color: #8e8e8e;">No open editors</div>';
        return;
    }
    const ul = document.createElement('ul');
    state.openFiles.forEach((fileData, fileHandle) => {
        const li = document.createElement('li');
        li.textContent = fileData.name;
        if (fileHandle === state.activeFileHandle) li.classList.add('active');
        li.addEventListener('click', () => setActiveFile(fileHandle));
        ul.appendChild(li);
    });
    openEditorsListEl.appendChild(ul);
}


export function initEditor() {
    window.addEventListener('app:save-file', saveActiveFile);

    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.34.1/min/vs' }});
    require(['vs/editor/editor.main'], () => {
        state.editorInstance = monaco.editor.create(editorContainer, {
            value: '', theme: 'vs-dark', automaticLayout: true,
            lineNumbers: 'on', glyphMargin: true, wordWrap: 'on',
            minimap: { enabled: true }
        });
        state.editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveActiveFile);
        
        state.editorInstance.onDidChangeCursorPosition(e => {
            if (state.activeFileHandle) {
                 statusCursorEl.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
            }
        });
    });
    renderOpenEditors();
}

export async function openFile(fileHandle) {
    let existingHandle = null;
    for (const key of state.openFiles.keys()) {
        if (await key.isSameEntry(fileHandle)) {
            existingHandle = key;
            break;
        }
    }

    if (existingHandle) {
        setActiveFile(existingHandle);
        return;
    }
    
    try {
        const file = await fileHandle.getFile();
        const content = await file.text();
        state.openFiles.set(fileHandle, { name: file.name, content, model: null, isDirty: false });
        setActiveFile(fileHandle);
    } catch (err) {
        console.error(`Error opening file ${fileHandle.name}:`, err);
    }
}

export function setActiveFile(fileHandle) {
    if (!state.editorInstance || state.activeFileHandle === fileHandle) return;
    
    welcomeMessage.style.display = 'none';
    state.activeFileHandle = fileHandle;
    let fileData = state.openFiles.get(fileHandle);

    if (!fileData) return;

    if (!fileData.model) {
        const language = getLanguage(fileData.name);
        fileData.model = monaco.editor.createModel(fileData.content, language);
        
        fileData.model.onDidChangeContent(() => {
            if (!fileData.isDirty) {
                fileData.isDirty = true;
                renderTabs();
            }
        });
        state.openFiles.set(fileHandle, fileData);
    }

    state.editorInstance.setModel(fileData.model);
    renderTabs();
    renderOpenEditors();
    updateStatusBar();
}

function renderTabs() {
    tabsContainer.innerHTML = '';
    state.openFiles.forEach((fileData, fileHandle) => {
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.textContent = fileData.name;
        if (fileHandle === state.activeFileHandle) tab.classList.add('active');
        
        const iconContainer = document.createElement('div');
        iconContainer.className = 'tab-icon';

        if (fileData.isDirty) {
            iconContainer.classList.add('unsaved-indicator');
            iconContainer.innerHTML = '●';
            iconContainer.title = "Unsaved changes";
        } else {
            iconContainer.innerHTML = '×';
            iconContainer.title = "Close";
            iconContainer.onclick = (e) => { e.stopPropagation(); closeFile(fileHandle); };
        }
        
        tab.appendChild(iconContainer);
        tab.onclick = () => setActiveFile(fileHandle);
        tabsContainer.appendChild(tab);
    });
}

export function closeFile(fileHandle, force = false) {
    let keyToDelete = null;
    for (const key of state.openFiles.keys()) {
        // isSameEntry is async, so we can't use it directly here in a simple way.
        // Relying on name is a decent fallback for this specific UI operation.
        if (key.name === fileHandle.name) {
            keyToDelete = key;
            break;
        }
    }

    if (!keyToDelete) return;

    const fileData = state.openFiles.get(keyToDelete);
    if (!force && fileData.isDirty) {
        if (!confirm(`${fileData.name} has unsaved changes. Close anyway?`)) {
            return;
        }
    }
    
    if (fileData.model) fileData.model.dispose();
    state.openFiles.delete(keyToDelete);

    if (state.activeFileHandle === keyToDelete) {
        const nextFile = state.openFiles.keys().next().value || null;
        state.activeFileHandle = null;
        if (nextFile) {
            setActiveFile(nextFile);
        } else {
            state.editorInstance.setModel(null);
            welcomeMessage.style.display = 'flex';
            renderTabs();
            renderOpenEditors();
            updateStatusBar();
        }
    } else {
        renderTabs();
        renderOpenEditors();
    }
}

export async function saveActiveFile() {
    if (!state.activeFileHandle) return;
    
    const fileData = state.openFiles.get(state.activeFileHandle);
    if (!fileData || !fileData.isDirty) return;

    const newContent = state.editorInstance.getValue();

    try {
        const writable = await state.activeFileHandle.createWritable();
        await writable.write(newContent);
        await writable.close();

        fileData.isDirty = false;
        fileData.content = newContent;
        renderTabs();
        console.log(`${fileData.name} saved.`);

        window.dispatchEvent(new CustomEvent('app:file-saved'));

    } catch (err) {
        console.error('File save failed:', err);
        alert(`Failed to save ${fileData.name}.`);
    }
}

function getLanguage(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const langMap = { js: 'javascript', ts: 'typescript', css: 'css', html: 'html', json: 'json', md: 'markdown', py: 'python' };
    return langMap[ext] || 'plaintext';
}

function updateStatusBar() {
    if (state.activeFileHandle) {
        const fileData = state.openFiles.get(state.activeFileHandle);
        statusLangEl.textContent = getLanguage(fileData.name).toUpperCase();
        const pos = state.editorInstance.getPosition();
        statusCursorEl.textContent = `Ln ${pos.lineNumber}, Col ${pos.column}`;
    } else {
        statusLangEl.textContent = '';
        statusCursorEl.textContent = '';
    }
}