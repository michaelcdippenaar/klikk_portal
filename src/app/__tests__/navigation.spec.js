import { describe, expect, it, vi } from 'vitest';
import routes from '../../router/routes';
import {
  OPERATION_NAV_GROUPS,
  PRIMARY_NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
  createNavigationCommands,
} from '../navigation';

function collectRouteNames(routeList) {
  return routeList.flatMap((route) => [
    ...(route.name ? [route.name] : []),
    ...(route.children ? collectRouteNames(route.children) : []),
  ]);
}

describe('application navigation registry', () => {
  it('only references routes that exist in the router', () => {
    const routeNames = new Set(collectRouteNames(routes));
    const navigationNames = [
      ...PRIMARY_NAV_ITEMS.map((item) => item.name),
      ...OPERATION_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.name)),
      ...SECONDARY_NAV_ITEMS.map((item) => item.name),
    ];

    expect(navigationNames.every((name) => routeNames.has(name))).toBe(true);
  });

  it('creates one executable command for every registered destination', () => {
    const routeNames = new Set(collectRouteNames(routes));
    const router = {
      hasRoute: vi.fn((name) => routeNames.has(name)),
      push: vi.fn(),
    };
    const commands = createNavigationCommands(router);
    const expectedCount = PRIMARY_NAV_ITEMS.length
      + OPERATION_NAV_GROUPS.reduce((total, group) => total + group.items.length, 0)
      + SECONDARY_NAV_ITEMS.length;

    expect(commands).toHaveLength(expectedCount);
    expect(new Set(commands.map((command) => command.id)).size).toBe(expectedCount);

    commands.find((command) => command.id === 'nav-audit-receipts-v2').perform();
    expect(router.push).toHaveBeenCalledWith({ name: 'audit-receipts-v2' });
  });
});
