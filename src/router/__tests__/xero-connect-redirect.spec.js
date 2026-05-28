import { describe, expect, it } from 'vitest';
import routes from '../routes';

describe('Xero OAuth redirect compatibility route', () => {
  it('forwards the backend callback landing URL to the portal route with query params intact', () => {
    const route = routes.find((item) => item.path === '/xero-connect');

    expect(route).toBeTruthy();
    expect(route.redirect({
      query: {
        status: 'success',
        tenants: 'Tremly (Pty) Ltd,Dippenaar Family,Klikk (Pty) Ltd',
        count: '3',
      },
    })).toEqual({
      name: 'xero-connect',
      query: {
        status: 'success',
        tenants: 'Tremly (Pty) Ltd,Dippenaar Family,Klikk (Pty) Ltd',
        count: '3',
      },
    });
  });
});
