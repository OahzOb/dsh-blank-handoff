# dsh-blank-handoff

English | [中文](#中文)

A DeepSeek Harness plugin. **Close a tab, connect again, and the interface says the
previous session is occupied — this removes that.**

## What it does

Every connection runs its own `dsh web`, on its own port. When a browser opens one it
picks a Workspace and prefers to reuse a **blank** Session — one nobody has said
anything in — rather than creating another empty one. That preference is good, and it
is also how a leftover Session gets adopted: the blank Session the *previous*
connection created is still on disk.

If that previous connection's server is still running it still holds the Session's
write lease, and the Host refuses with `session/writer-held`. The shipped client
recovers by creating a fresh Session, but it recovers *by throwing*, so the refusal
reaches the Conversation and you are told:

> 当前会话已被占用，可能是其他正在运行的 DSH 导致的（如其他 dsh web、桌面端），请退出其他正在运行的 DSH 后重试。

That message is untrue. A blank Session is one nobody is using.

**With this plugin installed**, that refusal is handed off to a fresh Session
silently, and the message never appears.

## What it deliberately does *not* change

The refusal is real, and stays real, for a Session that is genuinely in use. A
handoff needs **all** of:

- a named Session in the request — which is what adoption is;
- the `session/writer-held` code;
- a failure naming that same Session;
- a Session that is *not* the one the Conversation has selected.

Reopening the Session you are looking at, and being refused, is still reported. Only
the "nobody is using this" case is silent.

## Install

```
plugin_manager install_bundle  target: github:OahzOb/dsh-blank-handoff
```

The plugin manager also accepts a repository URL, a `.tgz`, a registry name, or a
local path. It writes the dependency into the profile and adds the name to
`dsh.profile.bundles` — both matter, and a package that is installed but not in the
bundle list does nothing at all.

**Prefer plain files over a link for a local checkout.** A `link:` install leaves a
reparse point in the profile's `node_modules`, and on Windows that link — a junction,
since creating a symlink needs a privilege the installing process may not have — was
measured failing `fs.realpathSync.native` inside the Harness's own profile resolution.
That does not skip one plugin; it stops the profile from booting:

```
Error: UNKNOWN: unknown error, realpath
  'C:\Users\…\.dsh\profiles\web\node_modules\dsh-blank-handoff'
```

Copying the package into `node_modules` leaves nothing to resolve. That is how this
checkout is installed: the files are copies, and the profile names the source in its
`dependencies` so the next person can see where they came from. A `file:` dependency
is the same idea done by the package manager, and is the better choice when the
install can run one — but it is a dependency form, not a copy, so verify that it
produced plain files rather than a link.

The Client half loads with the page, so **an already-open page keeps the shipped
behaviour until it reloads**.

## Verify it is working

The Client half keeps a counter on the page, because a plugin's console output is not
a reliable channel:

```js
globalThis.__dshBlankHandoff   // { installed: boolean, handedOff: number }
```

`installed: false` after a reload means the Sessions service never appeared and the
shipped behaviour is untouched. `handedOff` counts how many times the fix has fired.

## Related

The Android client this was found through:
[dsh-tabs-android](https://github.com/OahzOb/dsh-tabs-android) — a phone client for
Harness instances on other machines, over SSH.

---

<a id="中文"></a>
# dsh-blank-handoff（中文）

[English](#dsh-blank-handoff) | 中文

一个 DeepSeek Harness 插件。**关掉标签页再连接，界面会说"上一个会话被占用" —— 这个插件
把这句话去掉。**

## 它做什么

每次连接都会起一个自己的 `dsh web`，各有各的端口。浏览器打开其中一个时，会挑一个工作区，
并倾向于**复用它找到的空白会话** —— 也就是没人说过话的那个 —— 而不是再建一个新的。这个
倾向本身是好的，但也正是"接管遗留会话"的来源：上一次连接建的那个空白会话还在磁盘上。

如果上一次连接的服务**还活着**，它就仍握着那个会话的写租约，于是 Host 以
`session/writer-held` 拒绝。官方客户端其实能自愈（它会新建一个会话），但它是**先抛错再
自愈**，所以这个拒绝会冒到对话里，让你看到：

> 当前会话已被占用，可能是其他正在运行的 DSH 导致的（如其他 dsh web、桌面端），请退出其他正在运行的 DSH 后重试。

**这句话是不成立的** —— 空白会话就是没人用的会话。

**装上这个插件之后**，这种拒绝会被静默地转交给一个新会话，那句话不会再出现。

## 它刻意**不**改的部分

会话**确实在被使用**时，拒绝是真实的，也依然是真实的。触发转交需要**同时**满足：

- 请求里指名了某个会话（这正是"接管"的特征）；
- 错误码是 `session/writer-held`；
- 错误指的就是那个会话；
- 那个会话**不是**当前对话选中的那个。

你主动重开正在看的会话而被拒绝，仍然会照实报错。只有"没人在用"这种情况才是静默的。

## 安装

```
plugin_manager install_bundle  target: github:OahzOb/dsh-blank-handoff
```

插件管理器也接受仓库 URL、`.tgz`、包名，或磁盘上的绝对路径。它会把依赖写进 profile，并把
包名加进 `dsh.profile.bundles` —— 两样都要：装了但不在 bundle 列表里，等于什么都没做。

客户端半边随页面加载，所以**已经打开的页面在下一次刷新前仍是旧行为**。

## 怎么确认它在工作

客户端半边在页面上留了一个计数器（因为插件的 console 输出不是可靠通道）：

```js
globalThis.__dshBlankHandoff   // { installed: boolean, handedOff: number }
```

刷新后 `installed: false` 表示没等到 sessions 服务、行为未被改变；`handedOff` 是它生效过的
次数。

## 相关

发现这个问题的安卓客户端：[dsh-tabs-android](https://github.com/OahzOb/dsh-tabs-android)
—— 在手机上通过 SSH 连接其它机器上的 Harness。

---

# The engineering record

The sections below are in English only, and they carry the detail the summary above
does not: what each failure was, where it comes from, and how the fix was verified.
Where the two overlap, the summary answers *what happens*; this answers *why it is
that way*.

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
