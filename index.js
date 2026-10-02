/**
 * Host half of `dsh-blank-handoff`.
 *
 * Deliberately empty: the behaviour belongs to the Client, which is where the
 * Session is chosen. There is no Host-side counterpart to fix — the Host is
 * right to refuse a Session whose write lease another process still holds.
 *
 * This row exists so the bundle mounts and the Web Client module is loaded, the
 * same shape `dsh-turn-restart` uses.
 */
export function apply() {}
