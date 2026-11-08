export function safeDownloadName(value: string): string {
  const name = value.split(/[\\/]/).at(-1)!.replace(/[\u0000-\u001f\u007f<>:"|?*\u202a-\u202e\u2066-\u2069]/g, '_').replace(/[. ]+$/g, '').slice(0, 160);
  return !name || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) || name === '.' || name === '..' ? 'download.bin' : name;
}
export function safeDownloadChain(urls: string[]): boolean {
  if (!urls.length || urls.length > 20) return false;
  let secure = false;
  return urls.every(value => { try {
    const u = new URL(value);
    if (value.length > 4096 || u.username || u.password || !['https:', 'http:'].includes(u.protocol) || (secure && u.protocol !== 'https:')) return false;
    secure ||= u.protocol === 'https:'; return true;
  } catch { return false; } });
}
export function executableName(name: string): boolean { return /\.(exe|msi|msix|com|bat|cmd|ps1|vbs|js|jse|wsf|scr|pif|lnk|url|hta|reg|jar|dll|sh|app|dmg|deb|rpm)$/i.test(name); }
