// sw.js

// 서비스 워커가 활성화될 때 즉시 제어권을 갖도록 설정
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 파일 내용을 저장할 임시 저장소
let fileMap = new Map();

// 메인 앱으로부터 파일 데이터를 받는 리스너
self.addEventListener('message', (event) => {
  if (event.data.type === 'UPDATE_FILES') {
    // 받은 파일 데이터를 Map 형태로 변환하여 저장
    fileMap = new Map(event.data.files);
    console.log('Service Worker: Files updated.', fileMap);
  }
});

// 네트워크 요청을 가로채는 'fetch' 이벤트 리스너
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // 가상 서버의 루트 경로에 대한 요청만 처리
  if (url.origin === self.location.origin) {
    // 경로에서 맨 앞의 '/' 제거 (e.g., '/index.html' -> 'index.html')
    const path = url.pathname.substring(1);

    // 기본 파일은 index.html로 설정
    const filePath = path === '' ? 'index.html' : path;

    // fileMap에서 요청된 파일 찾기
    if (fileMap.has(filePath)) {
      const fileData = fileMap.get(filePath);
      
      // 적절한 MIME 타입 설정
      let mimeType = 'text/plain';
      if (filePath.endsWith('.html')) mimeType = 'text/html';
      else if (filePath.endsWith('.css')) mimeType = 'text/css';
      else if (filePath.endsWith('.js')) mimeType = 'application/javascript';
      else if (filePath.endsWith('.json')) mimeType = 'application/json';
      
      const response = new Response(fileData.content, {
        headers: { 'Content-Type': mimeType }
      });
      
      // 가로챈 요청에 대한 응답으로 파일 내용을 보냄
      event.respondWith(response);
    }
  }
});