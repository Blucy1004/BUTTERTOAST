import { createServer, Server } from 'node:http';
export const CONFIRMATION_URL = 'http://127.0.0.1:52149/auth/callback';
/** Transient loopback receiver for PKCE codes, not a web-accessible account server. */
export class ConfirmationListener {
  private server?: Server;
  private busy = false;
  private attempts = 0;
  constructor(private port = 52149) {}
  async start(complete: (code: string) => Promise<boolean>): Promise<string> {
    if (this.server) throw new Error('Confirmation receiver already open');
    this.busy = false; this.attempts = 0;
    const server = createServer(async (req, res) => {
      const reply = (status: number, text: string) => {
        res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'", 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', Connection: 'close' });
        res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>ButterToast</title><h1>ButterToast</h1><p>${text}</p></html>`);
      };
      const address = server.address(); const expectedHost = `127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
      if (req.method !== 'GET' || req.headers.host !== expectedHost || req.headers.origin || (req.headers['sec-fetch-mode'] && req.headers['sec-fetch-mode'] !== 'navigate')) { reply(403, '허용되지 않은 요청입니다.'); return; }
      if (!req.url || req.url.length > 4096 || !req.url.startsWith('/auth/callback?')) { reply(400, '인증 링크를 확인해 주세요.'); return; }
      let url: URL;
      try { url = new URL(req.url, `http://${expectedHost}`); } catch { reply(400, '인증 링크를 확인해 주세요.'); return; }
      const code = url.searchParams.get('code');
      if (url.pathname !== '/auth/callback' || !code || !/^[A-Za-z0-9_-]{8,2048}$/.test(code) || url.searchParams.getAll('code').length !== 1 || [...url.searchParams.keys()].some(k => k !== 'code')) { reply(400, '인증 링크를 확인해 주세요. ButterToast에서 다시 로그인할 수 있습니다.'); return; }
      if (this.busy || ++this.attempts > 10) { reply(429, '요청이 많습니다. ButterToast에서 다시 로그인해 주세요.'); return; }
      this.busy = true;
      try {
        const ok = await complete(code);
        reply(ok ? 200 : 400, ok ? '인증이 완료되었습니다. ButterToast 앱으로 돌아가세요.' : '인증을 완료하지 못했습니다. ButterToast 앱에서 다시 로그인해 주세요.');
        if (ok) { server.close(); if (this.server === server) this.server = undefined; }
      } catch { reply(400, '인증을 완료하지 못했습니다. ButterToast 앱에서 다시 로그인해 주세요.'); }
      finally { this.busy = false; }
    });
    server.maxConnections = 8; server.requestTimeout = 15_000; server.headersTimeout = 10_000;
    this.server = server;
    try {
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(this.port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
      server.on('error', () => this.close()); server.unref();
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('Receiver unavailable');
      return `http://127.0.0.1:${address.port}/auth/callback`;
    } catch { this.close(); throw new Error('Confirmation receiver unavailable'); }
  }
  close(graceful = false): void { const server = this.server; this.server = undefined; if (server) { server.close(); if (!graceful) server.closeAllConnections(); } }
}
