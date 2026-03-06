import path from 'path';
import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem;
const statusBarItemText = 'file size';
const defaultConfig = {
  alignment: 'right',
  priority: 0,
};

const pad = (num: number, length = 2) => {
  return ('' + num).padStart(length, '0');
};

const getWeek = (w: number) => {
  return ['日', '一', '二', '三', '四', '五', '六'][w];
};

const dateFormat = (time: number) => {
  // return new Date(time).toISOString().replace('T', ' ').slice(0, 19);
  const date = new Date(time);
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}/周${getWeek(date.getDay())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

type ITooltipData = {
  size: string;
  sizeFormatted: string;
  name: string;
  ext: string;
  url: vscode.Uri;
  c_date: string;
  m_date: string;
};

const createStatusBarItem = () => {
  const alignment = ['left', 'right'].indexOf(defaultConfig.alignment);
  // ========== 1. 创建状态栏项 ==========
  statusBarItem = vscode.window.createStatusBarItem(
    alignment === -1 ? 1 : alignment + 1, // 位置：右侧（Left 为左侧）
    defaultConfig.priority, // 优先级（数值越大越靠右/左）
  );

  statusBarItem.show();
  statusBarItem.command = 'file-size-vscode.getCurrentFileSize';
};

const setTooltip = (data?: ITooltipData) => {
  if (!statusBarItem) {
    const config = getConfig(vscode.window.activeTextEditor!.document);
    Object.assign(defaultConfig, config);
    createStatusBarItem();
  }

  const config = getConfig(vscode.window.activeTextEditor!.document);

  if (config.alignment !== defaultConfig.alignment || config.priority !== defaultConfig.priority) {
    Object.assign(defaultConfig, config);
    statusBarItem.dispose();
    createStatusBarItem();
  }

  if (data) {
    statusBarItem.text = data.sizeFormatted;

    const tooltip = new vscode.MarkdownString(
      `
## [${data.name}$(copy)](command:file-size-vscode.copy?${encodeURIComponent(JSON.stringify({ name: data.name }))})

---

- [在文件资源管理器中显示](command:file-size-vscode.open?${encodeURIComponent(
        JSON.stringify({ fsPath: data.url.fsPath }),
      )})

- 文件后缀: ${data.ext}

- 文件大小: ${data.sizeFormatted} (${data.size})

- 创建时间: ${data.c_date}

- 修改时间: ${data.m_date}

`,
      true,
    );
    tooltip.isTrusted = true;
    statusBarItem.tooltip = tooltip;
  } else {
    statusBarItem.text = statusBarItemText;
    const tooltip = new vscode.MarkdownString(`file size`, true);
    tooltip.isTrusted = true;
    statusBarItem.tooltip = tooltip;
  }
};

const floor = (num: number) => {
  return Math.floor(num * 100) / 100;
};

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
      sizeFormatted = `${floor(sizeInBytes / 1024).toFixed(2)} KB`;
    } else {
      sizeFormatted = `${floor(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    const pa = path.parse(fileUri.fsPath);
    setTooltip({
      size: `${sizeInBytes.toLocaleString()} B`,
      sizeFormatted: sizeFormatted,
      name: pa.name,
      ext: pa.ext,
      url: fileUri,
      c_date: dateFormat(fileStat.ctime),
      m_date: dateFormat(fileStat.mtime),
    });
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

/**
 * 获取当前文档的配置项
 */
const getConfig = (document: vscode.TextDocument) => {
  const config = vscode.workspace.getConfiguration('fileSizeVscode', document.uri);
  return {
    alignment: config.get<string>('alignment', 'right'),
    priority: config.get<number>('priority', 0),
  };
};

// 插件激活时注册命令，用于测试
export function activate(context: vscode.ExtensionContext) {
  getCurrentFileSize();

  const disposable = vscode.commands.registerCommand('file-size-vscode.getCurrentFileSize', () => {
    getCurrentFileSize();
  });

  const open = vscode.commands.registerCommand('file-size-vscode.open', (args) => {
    if (args && typeof args.fsPath === 'string') {
      const fsPath = args.fsPath.replace(/\\/g, '/');
      // 调用系统命令打开资源管理器
      vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(fsPath));
    }
  });

  // 复制文件名
  const copy = vscode.commands.registerCommand('file-size-vscode.copy', (args) => {
    if (args && typeof args.name === 'string') {
      vscode.env.clipboard.writeText(args.name);
    }
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
    open,
    copy,
    disposable,
    onDidOpenTextDocumentDisposable,
    onDidChangeActiveTextEditorDisposable,
    onDidSaveTextDocumentDisposable,
  );
}

export function deactivate() {}

