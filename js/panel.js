const editorPane = document.getElementById('editor-pane');
const bottomPanel = document.getElementById('bottom-panel');
const resizer = document.getElementById('panel-resizer');
const terminalOutput = document.getElementById('terminal-output');

// [수정] 여러 줄 로그를 처리하도록 개선
function logToTerminal(message) {
    const messageLines = message.split('\n');
    
    messageLines.forEach(lineText => {
        const line = document.createElement('div');
        line.className = 'terminal-line';
        
        const prompt = document.createElement('span');
        prompt.className = 'terminal-prompt';
        prompt.textContent = '>';
        
        const text = document.createElement('span');
        text.textContent = lineText;

        line.appendChild(prompt);
        line.appendChild(text);
        terminalOutput.appendChild(line);
    });
    
    terminalOutput.parentElement.scrollTop = terminalOutput.parentElement.scrollHeight;
}

function initResizer() {
    let startY, startEditorHeight, startPanelHeight;

    const onMouseMove = (e) => {
        const dy = e.clientY - startY;
        const newEditorHeight = startEditorHeight + dy;
        const newPanelHeight = startPanelHeight - dy;

        if (newPanelHeight > 40 && newEditorHeight > 100) {
            editorPane.style.height = `${newEditorHeight}px`;
            bottomPanel.style.height = `${newPanelHeight}px`;
        }
    };

    const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'default';
    };
    
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startY = e.clientY;
        startEditorHeight = editorPane.offsetHeight;
        startPanelHeight = bottomPanel.offsetHeight;
        document.body.style.cursor = 'ns-resize';
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });
}

export function initBottomPanel() {
    initResizer();
    window.addEventListener('app:log-terminal', (e) => {
        logToTerminal(e.detail);
    });
    logToTerminal("Terminal initialized.");
}