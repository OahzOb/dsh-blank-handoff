/**
 * Client half of `dsh-blank-handoff` — the whole fix.
 *
 * ## The behaviour it changes
 *
 * Every connection runs its own `dsh web`, on its own port, with its own token.
 * When a browser opens one of those servers it picks a Workspace, and for that
 * Workspace it prefers to reuse a **blank** Session — one nobody has said
 * anything in — instead of creating yet another empty one. That preference is
 * good, and it is also how a leftover Session gets adopted: the blank Session
 * the *previous* connection created is still on disk, so the new connection
 * tries to adopt it.
 *
 * If that previous connection's server is still running, it still holds the
 * Session's write lease, and the Host refuses with `session/writer-held`. The
 * shipped client recovers — it creates a fresh Session — but it recovers *by
 * throwing*, so the refusal reaches the Conversation and is reported as "this
 * session is already in use, possibly by another running DSH instance". That
 * message is untrue: a blank Session is one nobody is using, and nobody has
 * anything to lose by handing it off.
 *
 * So this wrapper catches exactly that case and returns the fresh Session
 * directly, and the refusal never becomes something the operator has to read.
 *
 * ## What it deliberately does not change
 *
 * The refusal is real and stays real for a Session that is genuinely in use.
 * Adoption is only handed off when *all* of these hold:
 *
 * - the request named a Session (`sessionId`), which is what adoption is;
 * - the failure was `session/writer-held`;
 * - the failure names that same Session, when it names one at all;
 * - that Session is **not** the one this Conversation has selected — asking to
 *   reopen what you are looking at, and being refused, must still be reported.
 *
 * A non-blank Session never reaches this path: only blank adoption asks for a
 * Session by id when nobody is looking at it.
 */

window.__ModuleLoader__.load({
  id: 'dsh-blank-handoff',
  factory(require) {
    /**
     * The failure code the Host uses when a Session's write lease is held by
     * another process. Inlined rather than imported: a Client half may not
     * import a Harness Client package, and this is a wire constant.
     */
    const WRITER_HELD = 'session/writer-held'

    /**
     * A diagnostic counter, readable from the page. Kept because a plugin's
     * console output is not a reliable channel, and "did this ever fire" should
     * be answerable after the fact.
     */
    const marks = (globalThis.__dshBlankHandoff = { installed: false, handedOff: 0 })

    /** Whether the Conversation currently has this Session selected. */
    function isCurrent(sessions, sessionId) {
      return sessions.list.getSnapshot().currentId === sessionId
    }

    /** The plain id, or the id a failure names, when either one is a string. */
    function namedId(value) {
      if (typeof value === 'string') return value
      if (value !== null && typeof value === 'object' && typeof value.sessionId === 'string') return value.sessionId
      return undefined
    }

    /** Whether a failed create was this connection adopting a Session held elsewhere. */
    function isForeignBlankHandoff(sessions, error, opts) {
      const requested = namedId(opts?.sessionId)
      if (requested === undefined) return false
      const failure = error?.rpcError
      if (failure === null || typeof failure !== 'object' || failure.code !== WRITER_HELD) return false
      const named = failure.details?.sessionId
      if (typeof named === 'string' && named !== requested) return false
      return !isCurrent(sessions, requested)
    }

    /**
     * Replace `sessions.create` with one that hands a refused blank adoption off.
     * @returns a disposer restoring the original method.
     */
    function install(sessions) {
      const original = sessions.create

      async function create(opts) {
        try {
          return await original.call(this, opts)
        } catch (error) {
          if (!isForeignBlankHandoff(sessions, error, opts)) throw error
          const workspaceId = opts?.workspaceId
          const cwd = opts?.cwd
          const fresh = workspaceId !== undefined ? { workspaceId } : cwd !== undefined ? { cwd } : undefined
          marks.handedOff += 1
          console.info(
            `blank-handoff: ${String(namedId(opts?.sessionId))} is held by another connection; ` +
              `opened a fresh blank Session instead (${String(marks.handedOff)} so far)`
          )
          // No `sessionId`: an unnamed create is a new Session, which is exactly
          // what the shipped recovery does after it has already failed.
          return await original.call(this, fresh)
        }
      }

      sessions.create = create
      marks.installed = true
      return () => {
        marks.installed = false
        sessions.create = original
      }
    }

    return {
      apply(ctx) {
        /**
         * The Sessions service is fetched rather than injected because the
         * Client context a plugin half receives exposes `get` and `effect` and
         * no `inject`. It is not guaranteed to exist at apply time — a plugin
         * marked `immediately` can run before the plugin that provides it — so
         * this waits, and gives up rather than polling forever. The same wait
         * covers a service replaced live.
         */
        ctx.effect(() => {
          let dispose
          let timer
          let attempts = 0
          const GRACE_ATTEMPTS = 20
          const GRACE_INTERVAL_MS = 250

          const settle = () => {
            if (dispose !== undefined) return
            const sessions = ctx.get('sessions')
            if (sessions === undefined || sessions === null || typeof sessions.create !== 'function') {
              attempts += 1
              if (attempts >= GRACE_ATTEMPTS) {
                timer = undefined
                console.error('blank-handoff: the sessions service never appeared; blank adoption is left as shipped')
                return
              }
              timer = setTimeout(settle, GRACE_INTERVAL_MS)
              return
            }
            timer = undefined
            dispose = install(sessions)
          }

          settle()
          return () => {
            if (timer !== undefined) clearTimeout(timer)
            if (dispose !== undefined) dispose()
          }
        }, 'blank-handoff: a leftover blank Session hands off instead of erroring')
      },
    }
  },
})
