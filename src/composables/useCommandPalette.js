/**
 * useCommandPalette — Klikk Design Language command palette composable.
 *
 * Exposes a singleton reactive registry of commands, an open/close state,
 * and helpers to register/unregister commands from any component or page.
 *
 * Global ⌘K / Ctrl-K listener is installed once when the composable is first
 * called with `installGlobalListener: true` (done by the app shell only).
 *
 * Command shape:
 * {
 *   id:        string                        — unique identifier
 *   label:     string                        — display text
 *   category:  string                        — group heading
 *   icon?:     string                        — Lucide icon name (sparingly)
 *   shortcut?: string[]                      — e.g. ['⌘', 'K']
 *   keywords?: string[]                      — extra fuzzy-match strings
 *   perform:   () => void | Promise<void>    — action to execute
 * }
 */

import { ref, readonly } from 'vue';

// ── Singleton state ──────────────────────────────────────────────────────────
const isOpen = ref(false);
const commands = ref(/** @type {Array} */ ([]));
let globalListenerInstalled = false;

// ── Keyboard handler ─────────────────────────────────────────────────────────
function isInTextField(event) {
  const tag = event.target?.tagName?.toLowerCase();
  const ce = event.target?.isContentEditable;
  return tag === 'input' || tag === 'textarea' || ce;
}

function handleGlobalKeydown(event) {
  // ⌘K / Ctrl-K — toggle palette (works everywhere including inputs,
  // mirrors Linear's behaviour; ⌘K in inputs is usually "create link"
  // in rich editors but we intercept here since this is an admin tool
  // without rich text. If that ever changes, restrict with isInTextField).
  const isK = event.key === 'k' || event.key === 'K';
  if (isK && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    isOpen.value = !isOpen.value;
    return;
  }

  // `/` — open when not focused in an input (Linear pattern — included).
  if (event.key === '/' && !isInTextField(event) && !isOpen.value) {
    event.preventDefault();
    isOpen.value = true;
  }
}

// ── Public composable ────────────────────────────────────────────────────────
export function useCommandPalette({ installGlobalListener = false } = {}) {
  if (installGlobalListener && !globalListenerInstalled) {
    globalListenerInstalled = true;
    window.addEventListener('keydown', handleGlobalKeydown);
  }

  function open() {
    isOpen.value = true;
  }

  function close() {
    isOpen.value = false;
  }

  /**
   * Register one or more commands. Safe to call multiple times with the same id
   * — later registration wins (replaces).
   * @param {object | object[]} commandOrCommands
   */
  function register(commandOrCommands) {
    const list = Array.isArray(commandOrCommands) ? commandOrCommands : [commandOrCommands];
    list.forEach((cmd) => {
      const idx = commands.value.findIndex((c) => c.id === cmd.id);
      if (idx !== -1) {
        commands.value.splice(idx, 1, cmd);
      } else {
        commands.value.push(cmd);
      }
    });
  }

  /**
   * Unregister commands by id. Call on component unmount to clean up
   * page-scoped commands.
   * @param {string | string[]} idOrIds
   */
  function unregister(idOrIds) {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    commands.value = commands.value.filter((c) => !ids.includes(c.id));
  }

  return {
    isOpen: readonly(isOpen),
    commands: readonly(commands),
    open,
    close,
    register,
    unregister,
  };
}
