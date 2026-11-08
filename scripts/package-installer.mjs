import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),folder=path.join(root,'artifacts/windows/ButterToast-win32-x64');
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(pkg.version))throw Error('Expected release version');
const verification=JSON.parse(await fs.readFile(path.join(folder,'BUILD-VERIFICATION.json'),'utf8'));
if(!verification.embeddedAsarHeaderHashVerified)throw Error('Build must be verified first');
const executable=await fs.readFile(path.join(folder,'ButterToast.exe'));
if(createHash('sha256').update(executable).digest('hex')!==verification.executableSha256)throw Error('Executable changed after verification');
const output=path.join(root,`artifacts/ButterToast-${pkg.version}-Setup-x64.exe`),script=path.join(root,'artifacts/installer.nsi');
const quote=value=>'"'+value.replaceAll('$','$$').replaceAll('"','$\\"')+'"';
const files=[],directories=[];
async function collect(dir,relative='') {for(const entry of await fs.readdir(dir,{withFileTypes:true})){const name=path.posix.join(relative,entry.name);if(!/^[\w./-]+$/.test(name))throw Error('Unsafe payload name');if(entry.isDirectory()){directories.push(name);await collect(path.join(dir,entry.name),name)}else if(entry.isFile())files.push(name);else throw Error('Unexpected payload link');}}
await collect(folder);
const deletion=files.map(file=>`Delete "$INSTDIR\\${file.replaceAll('/','\\')}"`).join('\n');
const removeDirs=directories.sort((a,b)=>b.length-a.length).map(dir=>`RMDir "$INSTDIR\\${dir.replaceAll('/','\\')}"`).join('\n');
await fs.writeFile(script,`Unicode True
!include "MUI2.nsh"
Name "ButterToast"
OutFile ${quote(output)}
InstallDir "$LOCALAPPDATA\\Programs\\ButterToast"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "${pkg.version}.0"
VIAddVersionKey "ProductName" "ButterToast"
VIAddVersionKey "FileDescription" "ButterToast development installer"
VIAddVersionKey "FileVersion" "${pkg.version}"
VIAddVersionKey "LegalCopyright" "ButterToast project"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Korean"
!insertmacro MUI_LANGUAGE "English"
Function .onInit
  StrCpy $1 0
  check:
  IfFileExists "$INSTDIR\\ButterToast.exe" 0 ready
  ClearErrors
  FileOpen $0 "$INSTDIR\\ButterToast.exe" a
  IfErrors running
  FileClose $0
  Goto ready
  running:
  IntOp $1 $1 + 1
  IntCmp $1 40 timeout
  Sleep 500
  Goto check
  timeout:
  MessageBox MB_OK|MB_ICONSTOP "Close ButterToast before installing."
  Abort
  ready:
FunctionEnd
Section "ButterToast"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r ${quote(folder+'/*')}
  WriteUninstaller "$INSTDIR\\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\\ButterToast"
  CreateShortcut "$SMPROGRAMS\\ButterToast\\ButterToast.lnk" "$INSTDIR\\ButterToast.exe"
  WriteRegStr HKCU "Software\\Classes\\ButterToastURL" "" "ButterToast URL"
  WriteRegStr HKCU "Software\\Classes\\ButterToastURL" "URL Protocol" ""
  WriteRegStr HKCU "Software\\Classes\\ButterToastURL\\shell\\open\\command" "" '$\\"$INSTDIR\\ButterToast.exe$\\" $\\"%1$\\"'
  WriteRegStr HKCU "Software\\ButterToast\\Capabilities" "ApplicationName" "ButterToast"
  WriteRegStr HKCU "Software\\ButterToast\\Capabilities" "ApplicationDescription" "ButterToast browser"
  WriteRegStr HKCU "Software\\ButterToast\\Capabilities\\URLAssociations" "http" "ButterToastURL"
  WriteRegStr HKCU "Software\\ButterToast\\Capabilities\\URLAssociations" "https" "ButterToastURL"
  WriteRegStr HKCU "Software\\RegisteredApplications" "ButterToast" "Software\\ButterToast\\Capabilities"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ButterToast" "DisplayName" "ButterToast"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ButterToast" "DisplayVersion" "${pkg.version}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ButterToast" "UninstallString" '$\\"$INSTDIR\\Uninstall.exe$\\"'
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  IfFileExists "$INSTDIR\\ButterToast.exe" 0 remove
  ClearErrors
  FileOpen $0 "$INSTDIR\\ButterToast.exe" a
  IfErrors running
  FileClose $0
  Goto remove
  running:
  MessageBox MB_OK|MB_ICONSTOP "Close ButterToast before uninstalling."
  Abort
  remove:
  ${deletion}
  Delete "$INSTDIR\\Uninstall.exe"
  ${removeDirs}
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\\ButterToast\\ButterToast.lnk"
  RMDir "$SMPROGRAMS\\ButterToast"
  DeleteRegKey HKCU "Software\\Classes\\ButterToastURL"
  DeleteRegKey HKCU "Software\\ButterToast\\Capabilities"
  DeleteRegValue HKCU "Software\\RegisteredApplications" "ButterToast"
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ButterToast"
SectionEnd
`);
execFileSync(process.env.MAKENSIS_BIN||'makensis',['-V2',script],{stdio:'inherit'});
const bytes=await fs.readFile(output);
if(bytes.toString('ascii',0,2)!=='MZ')throw Error('Invalid installer');
await fs.writeFile(output+'.json',JSON.stringify({version:pkg.version,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,signed:false,windowsExecutionTested:false,scope:'current-user',removesUserProfile:false},null,2)+'\n');
console.log(`Built unsigned installer: ${output}`);
