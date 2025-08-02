import { state } from './state.js';
import { getCheckedFilePaths } from './fileExplorer.js';
import { applyCodeModification } from './editor.js';

const chatMessagesEl = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const apiKeyInput = document.getElementById('api-key-input');
const modelSelect = document.getElementById('model-select');

let chatHistory = [];
let isLoading = false;

const commandRegex = /```(.*?):([\d]+|EOF):(add)\n([\s\S]+?)```|```(.*?):(\d+),(\d+):(remove)\n?([\s\S]*?)```/g;

// [수정] 한국어 형식의 엄격한 시스템 프롬프트
const systemPrompt = `당신은 웹 기반 코드 에디터에 내장된 전문 한국어 프로그래밍 어시스턴트입니다. 당신의 핵심 임무는 사용자의 질문에 답변하고, 지시에 따라 코드를 직접 수정하는 것입니다.

## ⭐ 핵심 임무 (Core Mission)
당신은 사용자의 말을 문자 그대로 해석하는 것을 넘어, 그들의 최종 목표와 의도를 파악해야 합니다. 제공된 대화 기록과 파일 컨텍스트를 분석하여 가장 논리적이고 안전한 해결책을 제시하세요.

##  kritiske regler (매우 중요한 규칙)
코드 수정이 필요할 때, 당신은 **반드시** 아래에 명시된 특별한 형식의 코드 블록만을 사용해야 합니다. 다른 어떤 방식으로도 코드를 수정하려고 시도해서는 안 됩니다. 이 형식은 시스템에 의해 자동으로 파싱되므로, 준수는 필수적입니다.

### 1. 코드 추가 (add)
-   특정 줄에 코드를 추가할 때: \`\`\`파일경로:줄번호:add
-   파일의 맨 끝에 코드를 추가할 때: \`\`\`파일경로:EOF:add (EOF는 End Of File을 의미합니다)

**예시 1: 'js/main.js' 파일의 25번째 줄에 코드 추가**
\`\`\`js/main.js:25:add
console.log('새로운 기능이 추가되었습니다!');
\`\`\`

**예시 2: 'style.css' 파일의 맨 끝에 코드 추가**
\`\`\`style.css:EOF:add
.new-class {
  color: blue;
}
\`\`\`

### 2. 코드 삭제 (remove)
-   반드시 \`시작줄,끝줄\` 형식을 사용해야 하며, 시작 줄 번호는 끝 줄 번호보다 작거나 같아야 합니다.

**예시: 'index.html' 파일의 15번째 줄부터 17번째 줄까지 삭제**
\`\`\`index.html:15,17:remove
\`\`\`
(remove 블록 안의 내용은 무시됩니다.)

## ⛔ 금지 사항 (Prohibitions)
-   **파일 경로**: 컨텍스트로 제공된 파일 경로(예: 'index.html', 'js/main.js')를 **정확히 그대로** 사용해야 합니다. 경로를 추측하거나 줄여 쓰지 마세요.
-   **허용되지 않은 키워드**: \`END_OF_FILE\`, \`start\`, \`end\` 와 같은 비표준 키워드를 절대 사용하지 마세요. 파일 끝은 오직 \`EOF\`만 허용됩니다.
-   **허용되지 않은 명령**: \`create-file\`, \`delete-file\`, \`move\`, \`rename\` 등 여기서 정의되지 않은 다른 모든 명령어는 금지됩니다.

## 💡 추론 및 질문
-   **추론**: 사용자의 요청이 "여기에 버튼 추가해줘"처럼 모호할 경우, 파일 내용을 분석하여 가장 논리적인 위치를 직접 추론하세요.
-   **가정 명시**: 추론을 통해 파일과 줄 번호를 결정했다면, "index.html 파일의 form 태그 안이 가장 적절해 보여 42번째 줄에 추가하겠습니다." 와 같이 **반드시 당신의 가정을 한국어로 설명**해야 합니다.
-   **질문**: 요청이 너무 모호하여 위험한 추측을 해야 할 경우, 코드를 수정하지 말고 "어떤 파일에 버튼을 추가할까요?" 와 같이 사용자에게 한국어로 질문하여 명확한 지시를 받으세요.
`;


function autoResizeTextarea() {
    chatInput.style.height = 'auto';
    chatInput.style.height = `${chatInput.scrollHeight}px`;
}

function addMessage(sender, text, isLoading = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender}`;
    if (isLoading) {
        msgDiv.classList.add('loading');
        msgDiv.innerHTML = '<div class="spinner"></div>';
    } else {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = text.replace(/\n/g, '<br>');

        const codeBlocks = tempDiv.querySelectorAll('pre');
        codeBlocks.forEach(block => {
            const innerText = block.textContent;
            commandRegex.lastIndex = 0;
            if (commandRegex.test(innerText)) {
                block.className = 'ai-command-block';
                block.innerHTML = `<code>${innerText.replace(/</g, '<').replace(/>/g, '>')}</code>`;
            } else {
                 block.innerHTML = `<code>${innerText.replace(/</g, '<').replace(/>/g, '>')}</code>`;
            }
        });
        msgDiv.innerHTML = tempDiv.innerHTML;
    }

    chatMessagesEl.appendChild(msgDiv);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    return msgDiv;
}

async function callGeminiAPI(prompt, history) {
    const apiKey = apiKeyInput.value || sessionStorage.getItem('gemini_api_key');
    if (!apiKey) {
        throw new Error("API Key is missing. Please enter your Gemini API Key.");
    }
    sessionStorage.setItem('gemini_api_key', apiKey);

    const model = modelSelect.value;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const contents = [...history, { role: 'user', parts: [{ text: prompt }] }];
    
    const requestBody = {
        contents,
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error: ${errorData.error.message}`);
    }

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) {
        throw new Error("No response from AI. The prompt may have been blocked due to safety settings.");
    }
    return data.candidates[0].content.parts[0].text;
}

// [수정] EOF 키워드 처리 로직 추가
async function parseAndApplyCodeModifications(responseText) {
    commandRegex.lastIndex = 0;
    let match;
    let modified = false;
    let modifications = [];

    while ((match = commandRegex.exec(responseText)) !== null) {
        modified = true;
        // 정규식 그룹 인덱스 조정
        const fileName = match[1] || match[5];
        const action = match[3] || match[8];
        
        let modInfo = {
            rawCommand: match[0],
            fileName: fileName.trim(),
            action: action
        };

        if (action === 'add') {
            modInfo.startLine = match[2]; // 'EOF' 또는 숫자 문자열
            modInfo.endLine = match[2];
            modInfo.content = match[4];
        } else { // remove
            modInfo.startLine = parseInt(match[6], 10);
            modInfo.endLine = parseInt(match[7], 10);
            modInfo.content = '';
        }
        modifications.push(modInfo);
    }

    if (!modified) return false;
    
    const groupedMods = modifications.reduce((acc, mod) => {
        if (!acc[mod.fileName]) acc[mod.fileName] = [];
        acc[mod.fileName].push(mod);
        return acc;
    }, {});

    for (const fileName in groupedMods) {
        const sortedMods = groupedMods[fileName].sort((a, b) => {
            const lineA = a.startLine === 'EOF' ? Infinity : a.startLine;
            const lineB = b.startLine === 'EOF' ? Infinity : b.startLine;
            return lineB - lineA;
        });

        for (const modInfo of sortedMods) {
            const commandHeader = `--- AI Executing Command ---`;
            window.dispatchEvent(new CustomEvent('app:log-terminal', { detail: `${commandHeader}\n${modInfo.rawCommand.trim()}` }));

            if (modInfo.action === 'remove' && modInfo.startLine > modInfo.endLine) {
                const errorLog = `ERROR: Invalid line range for removal in ${modInfo.fileName}. Command ignored.`;
                window.dispatchEvent(new CustomEvent('app:log-terminal', { detail: errorLog }));
                continue;
            }

            try {
                let mod;
                if (modInfo.action === 'add') {
                    const lineNumber = modInfo.startLine === 'EOF' ? 'EOF' : parseInt(modInfo.startLine, 10);
                    mod = {
                        range: null, // applyCodeModification에서 처리
                        text: modInfo.content,
                        lineNumber: lineNumber
                    };
                } else { // remove
                    mod = {
                        range: new monaco.Range(modInfo.startLine, 1, modInfo.endLine + 1, 1),
                        text: '',
                    };
                }
                await applyCodeModification(modInfo.fileName, mod, modInfo.action);
                const successLog = `SUCCESS: Command for '${modInfo.fileName}' executed.`;
                window.dispatchEvent(new CustomEvent('app:log-terminal', { detail: successLog }));
            } catch (e) {
                const errorLog = `ERROR executing command for ${modInfo.fileName}: ${e.message}`;
                window.dispatchEvent(new CustomEvent('app:log-terminal', { detail: errorLog }));
                alert(`Failed to modify code in '${modInfo.fileName}': ${e.message}`);
            }
        }
    }
    return modified;
}


async function handleSendMessage() {
    const userInput = chatInput.value.trim();
    if (!userInput || isLoading) return;

    isLoading = true;
    chatInput.value = '';
    autoResizeTextarea();
    chatSendBtn.disabled = true;

    addMessage('user', userInput);
    const loadingMessageEl = addMessage('ai', '', true);

    try {
        const contextFiles = await getCheckedFilePaths();
        let fileContextPrompt = '';
        if (contextFiles.length > 0) {
            fileContextPrompt = "컨텍스트로 제공된 파일은 다음과 같습니다:\n\n";
            for (const fileInfo of contextFiles) {
                fileContextPrompt += `--- 파일: ${fileInfo.path} ---\n\`\`\`\n${fileInfo.content}\n\`\`\`\n\n`;
            }
        }
        
        const fullPrompt = `${fileContextPrompt}사용자 질문: ${userInput}`;
        const aiResponseText = await callGeminiAPI(fullPrompt, chatHistory);
        
        const wasModified = await parseAndApplyCodeModifications(aiResponseText);
        
        loadingMessageEl.remove();
        addMessage('ai', aiResponseText);
        
        chatHistory.push({ role: 'user', parts: [{ text: userInput }] });
        chatHistory.push({ role: 'model', parts: [{ text: aiResponseText }] });

    } catch (error) {
        loadingMessageEl.remove();
        addMessage('ai', `Error: ${error.message}`);
        console.error("AI Error:", error);
    } finally {
        isLoading = false;
        chatSendBtn.disabled = false;
        chatInput.focus();
    }
}

export function initChat() {
    addMessage('ai', '안녕하세요! Gemini API 키를 입력해주세요. 탐색기에서 파일을 체크하여 대화의 컨텍스트로 추가할 수 있습니다.');
    
    apiKeyInput.value = sessionStorage.getItem('gemini_api_key') || '';
    apiKeyInput.addEventListener('input', () => {
        sessionStorage.setItem('gemini_api_key', apiKeyInput.value);
    });

    chatSendBtn.addEventListener('click', handleSendMessage);
    chatInput.addEventListener('input', autoResizeTextarea);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });
}