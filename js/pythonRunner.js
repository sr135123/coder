// js/pythonRunner.js

let pyodide = null;

// Pyodide를 비동기적으로 로드하고 초기화하는 함수
async function loadPyodideAndPackages() {
    if (pyodide) {
        return pyodide;
    }
    
    // 터미널에 로딩 메시지 표시
    window.dispatchEvent(new CustomEvent('app:log-terminal', { detail: 'Initializing Python runtime (Pyodide)... This may take a moment.' }));
    
    // Pyodide 로드
    pyodide = await loadPyodide();
    
    // 표준 출력을 가로채기 위해 Python의 io, sys 모듈 로드
    await pyodide.loadPackage(['micropip']);
    const io = pyodide.pyimport("io");
    const sys = pyodide.pyimport("sys");

    window.dispatchEvent(new CustomEvent('app:log-terminal', { detail: 'Python runtime ready.' }));
    return { pyodide, io, sys };
}

// 외부에서 호출할 Python 코드 실행 함수
export async function runPythonCode(code) {
    try {
        const { pyodide, io, sys } = await loadPyodideAndPackages();

        // Python의 표준 출력(stdout)과 표준 에러(stderr)의 방향을 바꿈
        const stdout = new io.StringIO();
        const stderr = new io.StringIO();
        sys.stdout = stdout;
        sys.stderr = stderr;

        // Python 코드 실행
        const result = await pyodide.runPythonAsync(code);

        // 출력과 에러 내용 가져오기
        const output = stdout.getvalue();
        const error = stderr.getvalue();

        // 표준 출력/에러 되돌리기
        sys.stdout = sys.__stdout__;
        sys.stderr = sys.__stderr__;

        // 결과 반환
        return {
            result: result, // 마지막 표현식의 결과
            output: output, // print()문의 결과
            error: error    // 에러 메시지
        };

    } catch (err) {
        // Pyodide 실행 중 발생한 자바스크립트 예외 처리
        console.error("Pyodide execution error:", err);
        return { error: err.message };
    }
}