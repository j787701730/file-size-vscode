import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;
const statusBarItemText = 'file size';
/**
 * 获取当前激活文件的大小（单位：字节，可选转换为KB/MB）
 */
async function getCurrentFileSize(): Promise<{ size: number; sizeFormatted: string } | null> {
  // 1. 获取当前激活的文本编辑器
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    // vscode.window.showErrorMessage('没有激活的编辑文件！');
    return null;
  }

  const fileUri = activeEditor.document.uri;
  // 排除非文件类型（如虚拟文档、输入框等）
  if (fileUri.scheme !== 'file') {
    // vscode.window.showErrorMessage('当前激活的不是本地文件！');
    return null;
  }

  try {
    // 2. 使用VS Code内置workspace.fs获取文件统计信息（包含大小）
    const fileStat = await vscode.workspace.fs.stat(fileUri);

    // 3. 格式化文件大小（字节 -> KB/MB，方便阅读）
    const sizeInBytes = fileStat.size;
    let sizeFormatted = '';
    if (sizeInBytes < 1024) {
      sizeFormatted = `${sizeInBytes} B`;
    } else if (sizeInBytes < 1024 * 1024) {
      sizeFormatted = `${(sizeInBytes / 1024).toFixed(2)} KB`;
    } else {
      sizeFormatted = `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    statusBarItem.text = sizeFormatted;
    // 4. 返回原始大小和格式化后的大小
    return {
      size: sizeInBytes,
      sizeFormatted: sizeFormatted,
    };
  } catch (error) {
    // vscode.window.showErrorMessage(`获取文件大小失败：${(error as Error).message}`);
    return null;
  }
}

// 插件激活时注册命令，用于测试
export function activate(context: vscode.ExtensionContext) {
  // ========== 1. 创建状态栏项 ==========
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right, // 位置：右侧（Left 为左侧）
    0, // 优先级（数值越大越靠右/左）
  );
  const tooltip = new vscode.MarkdownString(`file size`, true);

  tooltip.isTrusted = true;

  statusBarItem.tooltip = tooltip;
  // ========== 2. 配置状态栏样式和内容 ==========
  statusBarItem.text = statusBarItemText; // 文本 + 内置图标（tag 是标签图标）
  statusBarItem.show();
  statusBarItem.command = 'file-size-vscode.getCurrentFileSize';

  getCurrentFileSize();

  const disposable = vscode.commands.registerCommand('file-size-vscode.getCurrentFileSize', () => {
    getCurrentFileSize();
  });

  // ======================================
  // 场景1：监听「文件被首次打开」（新建/打开本地文件时触发，仅触发一次 per 文件）
  // ======================================
  const onDidOpenTextDocumentDisposable = vscode.workspace.onDidOpenTextDocument(() => {
    getCurrentFileSize();
  });

  // ======================================
  // 补充场景：监听「切换已打开的文件」（文件已打开，切换标签页时触发）
  // ======================================
  const onDidChangeActiveTextEditorDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
    getCurrentFileSize();
  });

  // ======================================
  // 场景2：监听「文件被保存」（手动保存/自动保存均触发）
  // ======================================
  const onDidSaveTextDocumentDisposable = vscode.workspace.onDidSaveTextDocument(() => {
    getCurrentFileSize();
  });

  context.subscriptions.push(
    disposable,
    onDidOpenTextDocumentDisposable,
    onDidChangeActiveTextEditorDisposable,
    onDidSaveTextDocumentDisposable,
  );
}

export function deactivate() {}

