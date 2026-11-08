import { app, shell } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
/** Called only by an explicit trusted settings action. Never selects a default without the OS chooser. */
export async function openDefaultBrowserSettings(): Promise<string> {
  if (!app.isPackaged) return '기본 브라우저 등록은 패키징된 앱에서 사용할 수 있습니다.';
  if (process.platform === 'win32') {
    const executable = process.execPath;
    if (/["\r\n]/.test(executable)) return '실행 파일 경로를 등록할 수 없습니다.';
    const base = 'HKCU\\Software\\Classes\\ButterToastURL';
    const capabilities = 'HKCU\\Software\\ButterToast\\Capabilities';
    const entries: [string, string | null, string][] = [
      [base, null, 'ButterToast URL'], [base, 'URL Protocol', ''],
      [`${base}\\shell\\open\\command`, null, `"${executable}" "%1"`],
      [capabilities, 'ApplicationName', 'ButterToast'], [capabilities, 'ApplicationDescription', 'ButterToast browser'],
      [`${capabilities}\\URLAssociations`, 'http', 'ButterToastURL'], [`${capabilities}\\URLAssociations`, 'https', 'ButterToastURL'],
      ['HKCU\\Software\\RegisteredApplications', 'ButterToast', 'Software\\ButterToast\\Capabilities']
    ];
    for (const [key, name, value] of entries) await run('reg.exe', ['add', key, ...(name === null ? ['/ve'] : ['/v', name]), '/t', 'REG_SZ', '/d', value, '/f'], { windowsHide: true, timeout: 10000 });
    await shell.openExternal('ms-settings:defaultapps');
    return 'Windows 기본 앱 설정에서 ButterToast를 선택하세요.';
  }
  if (process.platform === 'darwin') {
    app.setAsDefaultProtocolClient('http'); app.setAsDefaultProtocolClient('https');
    return 'macOS의 기본 브라우저 선택을 확인하세요.';
  }
  return '이 플랫폼의 기본 앱 설정에서 설치한 ButterToast를 선택하세요.';
}
