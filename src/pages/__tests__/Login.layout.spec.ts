import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const ROOT = new URL('../../../', import.meta.url);
const loginVue = readFileSync(
  fileURLToPath(new URL('src/pages/Login.vue', ROOT)),
  'utf-8',
);

describe('Login layout', () => {
  it('does not rely on legacy Quasar utility classes for page centering', () => {
    expect(loginVue).not.toContain('class="fullscreen flex flex-center login-page"');
    expect(loginVue).toContain('class="login-page"');
  });

  it('centers the login stack with component-owned CSS', () => {
    const styleMatch = /<style scoped>([\s\S]*?)<\/style>/.exec(loginVue);
    expect(styleMatch, 'Could not find Login.vue scoped style').not.toBeNull();

    const css = styleMatch![1];
    const pageBlock = /\.login-page\s*\{([^}]*)\}/s.exec(css);
    expect(pageBlock, 'Could not find .login-page CSS block').not.toBeNull();
    expect(pageBlock![1]).toContain('display: flex');
    expect(pageBlock![1]).toContain('align-items: center');
    expect(pageBlock![1]).toContain('justify-content: center');
    expect(pageBlock![1]).toContain('min-height: 100vh');
  });
});
