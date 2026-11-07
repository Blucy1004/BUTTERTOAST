const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isWebUrl, resolveAddress } = require('../dist/policy.js');
test('accept only web URLs without credentials', () => {
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'https://u:p@example.com', 'https://u@example.com', 'not a url']) assert.equal(isWebUrl(url), false, url);
  for (const url of ['https://example.com/', 'http://localhost:8080/']) assert.equal(isWebUrl(url), true, url);
});
test('addresses default to HTTPS, searches are encoded and unsafe schemes rejected', () => {
  assert.equal(resolveAddress('example.com'), 'https://example.com/');
  assert.equal(resolveAddress('localhost:3000'), 'https://localhost:3000/');
  assert.equal(resolveAddress('http://localhost:3000'), 'http://localhost:3000/');
  assert.equal(resolveAddress('butter toast'), 'https://www.google.com/search?q=butter%20toast');
  for (const s of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user@example.com', '', 'foo\nbar']) assert.equal(resolveAddress(s), null, s);
});
