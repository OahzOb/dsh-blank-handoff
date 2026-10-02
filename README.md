# dsh-blank-handoff

A DeepSeek Harness plugin: a **blank Session** left behind by a previous
connection hands off to a fresh one instead of being reported as *"this session
is already in use"*.

## The problem it fixes

Every connection runs its own `dsh web`, on its own port, with its own token.
When a browser opens one of those servers it picks a Workspace and, for that
Workspace, prefers to reuse a **blank** Session — one nobody has said anything in
— rather than creating another empty one. That preference is good, and it is also
how a leftover Session gets adopted: the blank Session the *previous* connection
created is still on disk, so the next connection tries to adopt it.

If that previous connection's server is still running, it still holds the
Session's write lease, and the Host refuses with `session/writer-held`. The
shipped client recovers — it creates a fresh Session — but it recovers *by
throwing*, so the refusal reaches the Conversation and is shown as:

> 当前会话已被占用，可能是其他正在运行的 DSH 导致的（如其他 dsh web、桌面端），请退出其他正在运行的 DSH 后重试。

That message is untrue. A blank Session is one nobody is using, and nobody has
anything to lose by handing it off. On the desktop client's own flow this shows
up as: close a tab, connect again, and be told the previous session is occupied.

Where it comes from, for the record:

| Piece | Location |
| --- | --- |
| The message | `@deepseek-ai/dsh-client-ui-conversation` → `error.sessionInUse` |
| The code it keys on | `session/writer-held`, thrown by `@deepseek-ai/dsh-api-session-controller` |
| What raises it | `SessionAlreadyOwnedError` from the Session write lease (a kernel lock, per Session directory) |
| Who triggers it | `@deepseek-ai/dsh-client-ui-workspace` → `reuseOrCreateBlank` → `reuseBlank` |
| The wrong recovery | `reuseBlank` catches `session/writer-held`, then **rethrows** it after creating a fresh Session |

## What it changes

One wrapper around `ctx.sessions.create`. When a create that **named a Session**
fails with `session/writer-held`, it retries **without** the id — a new Session —
and returns that. The refusal never reaches the Conversation.

## What it deliberately leaves alone

The refusal is real and stays real for a Session that is genuinely in use. It
hands off only when all of these hold:

- the request named a Session (`sessionId`) — which is what adoption is;
- the failure was `session/writer-held`;
- the failure names that same Session, when it names one at all;
- that Session is **not** the one the Conversation has selected. Asking to reopen
  the Session you are looking at, and being refused, must still be reported.

A non-blank Session never reaches this path: only blank adoption asks for a
Session by id when nobody is looking at it.

## Verified

Verified in an isolated sandbox profile (`DSH_HOME` pointed at a scratch
directory, `--patch` overlay mounting this exact file), two real `dsh web`
servers, two real Chrome connections, watching the wire:

```
[two] api/session/create  ok=false  code=session/writer-held  ids=session-3ed0cf64-…
[two] CONSOLE: blank-handoff: session-3ed0cf64-… is held by another connection; opened a fresh blank Session instead (1 so far)
[two] api/session/create  ok=true   code=undefined            ids=session-ccff8ef3-…
[two] PLUGIN MARKER: {"installed":true,"handedOff":1}
connection 2 reported "in use": false
```

The refusal still happens on the wire — the test would be worthless if it did not
— and the page never reports it. The conversation lands in a fresh blank Session.

### Observability

The client half keeps a counter on the page, because a plugin's console output is
not a reliable channel:

```js
globalThis.__dshBlankHandoff   // { installed: boolean, handedOff: number }
```

`installed: false` after a page reload means the Sessions service never appeared
within five seconds and the shipped behaviour is untouched.

## Install

The plugin is a bundle, so it installs through the plugin manager rather than by
hand — a profile dependency plus bundle selection is what makes the row mount:

```
plugin_manager install_bundle  target: github:OahzOb/dsh-blank-handoff
```

The plugin manager takes a GitHub shorthand (`github:owner/repo`), a repository URL,
a `.tgz`, or a registry name. It also takes an absolute path to a checkout on disk,
which is how this one is installed during development.

That writes `"dsh-blank-handoff": "link:<path>"` into the profile's `dependencies` and
appends the name to `dsh.profile.bundles`. Both matter: the dependency is what makes
the package resolvable, and the bundle entry is what makes its patch layer mount. A
package that is installed but not in the bundle list does nothing at all.

Confirmed live on a running server, rather than inferred from the install:

```
include:blank-handoff   moduleName dsh-blank-handoff   enabled: true   fiberPhase: active
```

The Client half loads with the page, so **an already-open page keeps the shipped
behaviour until it reloads**.

### If `install_bundle` reports `'pnpm' is not recognized`

That failure looks like a plugin problem and is not one: pnpm is broken on the
machine, and it blocks every install of every plugin. It is worth recognising because
the diagnostic is misleading. Two faults, both seen in the wild:

1. **The entry point pointed at a deleted directory.** `%LOCALAPPDATA%\pnpm\bin\pnpm.cmd`
   referenced `global\v11\<hash>\node_modules\@pnpm\exe\pnpm.exe`, a junction into a
   package that had been installed from `%TEMP%` and was since removed. The executable
   itself still existed inside pnpm's own store, under `node_modules\.pnpm\`; pointing
   the `.cmd` at that path fixed it without reinstalling anything.
2. **The harness's `PATH` contained the literal text `%PNPM_HOME%\bin`, never
   expanded**, so pnpm was searched for in a directory of that name. This is the
   subtle one: a long-lived process keeps the environment it started with, so
   repairing `PATH` in a shell does not reach it. The fix was a `pnpm.cmd` shim in a
   directory that *was* already on the harness's `PATH`.

Check it with `pnpm --version` before looking at the plugin.

## Layout

| File | Role |
| --- | --- |
| `index.js` | Host half — inert, present so the bundle mounts and the Client module loads |
| `client.js` | The whole fix: the `ctx.sessions.create` wrapper |
| `cordis.patch.yml` | Bundle layer: one plugin row |
