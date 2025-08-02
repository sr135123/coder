// js/run.js
import { state } from './state.js';
import { runPythonCode } from './pythonRunner.js'; // [신규]

let serviceWorkerRegistration = null;

async function getAllFiles(dirHandle, currentPath = '') {
    // ... 이전과 동일
}

async function updateServiceWorkerFiles() {
    // ... 이전과 동일
}

// [수정] "Run" 버튼 로직
async function handleRun() {
    if (!state.directoryHandle) {
        alert("Please open a folder first to run.");
        return;
    }

    // 현재 활성화된 파일 가져오기
    const activeFile = state.openFiles.get(state.activeFileHandle);
    if (!activeFile) {
        alert("Please select a file to run.");
        return;
    }

    // 파일 확장자에 따라 분기
    if (activeFile.name.endsWith('.py')) {
        // Python 파일 실행
        window.dispatchEvent(new CustomEvent('app:log-terminal', { detail: `Running ${activeFile.name}...` }));
        const code = activeFile.model.getValue(); // 에디터의 최신 내용 가져오기
        const { output, error, result } = await runPythonCode(code);
        
        if (output) {
            window.dispatchEvent(new CustomEvent('app:log-terminal', { detail: output }));
        }
        if (error) {
            window.dispatchEvent(new CustomEvent('app:log-terminal', { detail: `ERROR: ${error}` }));
        }
        window.dispatchEvent(new CustomEvent('app:log-terminal', { detail: `--- Execution finished ---` }));

    } else {
        // 그 외 파일들(HTML 등)은 Live Server 실행
        if (!serviceWorkerRegistration || !serviceWorkerRegistration.active) {
            alert("Live server is not ready yet. Please try again in a moment.");
            return;
        }
        await updateServiceWorkerFiles();
        window.open('/', '_blank');
        window.dispatchEvent(new CustomEvent('app:log-terminal', { detail: 'Live server session started in a new tab.' }));
    }
}

export function initRunServer() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                serviceWorkerRegistration = registration;
                console.log('Service Worker registered successfully.');
                window.addEventListener('app:file-saved', updateServiceWorkerFiles);
            }).catch(error => {
                console.error('Service Worker registration failed:', error);
            });
    } else {
        console.warn("Service Workers are not supported in this browser. Live Server feature will not work.");
    }

    const runButton = document.querySelector('#activity-bar .icon[title="Run and Debug"]');
    if (runButton) {
        runButton.addEventListener('click', handleRun);
    }
}