export function safeDownloadName(value: string): string {
  let name = value.split(/[\\/]/).at(-1)!.normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"|?*\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '_').replace(/[. ]+$/g, '');
  if(name.length>160){const extension=name.match(/\.[a-zA-Z0-9]{1,16}$/)?.[0]??'';name=name.slice(0,160-extension.length).replace(/[. ]+$/g,'')+extension;}
  return !name || /^(con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(name) || name === '.' || name === '..' ? 'download.bin' : name;
}
/** Blob exports require the active human document's non-opaque origin. */
export function safeDownloadChain(urls: string[], sourceUrl?: string): boolean {
  if (!urls.length || urls.length > 20) return false;
  let source: URL | undefined;
  // A direct attachment URL can start in a new, still-blank human tab.
  if (sourceUrl !== undefined && sourceUrl !== '' && sourceUrl !== 'about:blank') {
    try { source = new URL(sourceUrl); } catch { return false; }
    if (!['https:', 'http:'].includes(source.protocol) || source.username || source.password) return false;
  }
  if (urls[0].startsWith('blob:')) {
    try {
      const blob = new URL(urls[0]), creator = new URL(urls[0].slice(5));
      return !!source && urls.length === 1 && urls[0].length <= 4096 && !/[\u0000-\u001f\u007f\\]/.test(urls[0])
        && !creator.username && !creator.password && !blob.hash && !blob.search && blob.origin !== 'null' && blob.origin === source.origin;
    } catch { return false; }
  }
  let secure = source?.protocol === 'https:';
  return urls.every(value => { try {
    const u = new URL(value);
    if (value.length > 4096 || /[\u0000-\u001f\u007f\\]/.test(value) || u.username || u.password || !['https:', 'http:'].includes(u.protocol) || (secure && u.protocol !== 'https:')) return false;
    secure ||= u.protocol === 'https:'; return true;
  } catch { return false; } });
}
export function executableName(name: string): boolean { return /\.(exe|msi|msix|msixbundle|appx|appxbundle|com|bat|cmd|ps1|psm1|psd1|vbs|vbe|js|jse|wsf|wsh|scr|pif|lnk|url|hta|reg|jar|dll|cpl|msc|scf|inf|chm|iso|img|vhd|vhdx|docm|xlsm|pptm|sh|app|dmg|deb|rpm|desktop|apk)$/i.test(name.replace(/[. ]+$/g,'')); }
/** Internet-zone metadata excludes query, fragment, credentials and referrer secrets. */
export function downloadZone(origin:string):string {
  const url=new URL(origin);if(!['http:','https:'].includes(url.protocol)||url.origin!==origin)throw Error('Invalid source origin');
  return `[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=${url.origin}/\r\n`;
}
