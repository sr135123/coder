// js/run.js
import { state } from './state.js';

let serviceWorkerRegistration = null;

// 모든 파일의 경로와 내용을 배열 형태로 가져오는 함수
async function getAllFiles(dirHandle, currentPath = '') {
    let files = [];
    for await (const entry of dirHandle.values()) {
        const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
            const file = await entry.getFile();
            const content = await file.text();
            files.push([newPath, { content }]);
        } else if (entry.kind === 'directory') {
            files = files.concat(await getAllFiles(entry, newPath));
        }
    }
    return files;
}

// 서비스 워커에 최신 파일 데이터를 전송하는 함수
async function updateServiceWorkerFiles() {
    if (!serviceWorkerRegistration || !serviceWorkerRegistration.active || !state.directoryHandle) {
        return;
    }
    const allFiles = await getAllFiles(state.directoryHandle);
    serviceWorkerRegistration.active.postMessage({
        type: 'UPDATE_FILES',
        files: allFiles
    });
}

// "Run and Debug" 버튼 클릭 시 실행될 함수
async function runLiveServer() {
    if (!state.directoryHandle) {
        alert("Please open a folder first to run the live server.");
        return;
    }
    
    // 서비스 워커가 준비될 때까지 기다림
    if (!serviceWorkerRegistration || !serviceWorkerRegistration.active) {
        alert("Live server is not ready yet. Please try again in a moment.");
        return;
    }

    // 실행 전 최신 파일 내용 전송
    await updateServiceWorkerFiles();
    
    // 새 탭에서 루트 URL 열기
    window.open('/', '_blank');
    
    window.dispatchEvent(new CustomEvent('app:log-terminal', { detail: 'Live server session started in a new tab.' }));
}

// 서비스 워커 등록 및 초기화
export function initRunServer() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                serviceWorkerRegistration = registration;
                console.log('Service Worker registered successfully.');
                
                // 주기적으로 또는 파일 저장 시 파일 업데이트 (여기서는 간단히 5초마다)
                // setInterval(updateServiceWorkerFiles, 5000);
                // 더 나은 방법: 파일 저장 시 업데이트
                window.addEventListener('app:file-saved', updateServiceWorkerFiles);

            }).catch(error => {
                console.error('Service Worker registration failed:', error);
            });
    } else {
        console.warn("Service Workers are not supported in this browser. Live Server feature will not work.");
    }

    const runButton = document.querySelector('#activity-bar .icon[title="Run and Debug"]');
    if (runButton) {
        runButton.addEventListener('click', runLiveServer);
    }
}