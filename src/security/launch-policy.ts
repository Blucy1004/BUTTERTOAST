/** Fail closed on known Chromium/Node switches that undermine the shipped boundaries.
 * This is defense against unsafe launch configuration, not protection from a hostile OS user.
 */
export const UNSAFE_SWITCHES: readonly string[] = Object.freeze([
  'no-sandbox', 'disable-setuid-sandbox', 'disable-gpu-sandbox', 'single-process', 'in-process-gpu',
  'disable-web-security', 'allow-running-insecure-content', 'allow-file-access-from-files',
  'ignore-certificate-errors', 'ignore-certificate-errors-spki-list', 'allow-insecure-localhost',
  'unsafely-treat-insecure-origin-as-secure', 'disable-site-isolation-trials', 'disable-site-isolation-for-policy',
  'remote-debugging-port', 'remote-debugging-pipe', 'remote-allow-origins',
  'inspect', 'inspect-brk', 'inspect-wait', 'inspect-port', 'renderer-cmd-prefix',
  'disable-features', 'enable-features', 'enable-blink-features', 'disable-blink-features',
  'enable-experimental-web-platform-features', 'enable-unsafe-webgpu', 'js-flags'
]);
export function assertSafeSwitches(hasSwitch: (name: string) => boolean): void {
  if (UNSAFE_SWITCHES.some(hasSwitch)) throw new Error('Unsafe Chromium launch configuration');
}
