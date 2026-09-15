var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// ../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// ../node_modules/.pnpm/@cloudflare+unenv-preset@2.16.1_unenv@2.0.0-rc.24_workerd@1.20260911.1/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
if (!("__unenv__" in performance)) {
  const proto = Performance.prototype;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key !== "constructor" && !(key in performance)) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc) {
        Object.defineProperty(performance, key, desc);
      }
    }
  }
}
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// ../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// ../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// ../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// ../node_modules/.pnpm/@cloudflare+unenv-preset@2.16.1_unenv@2.0.0-rc.24_workerd@1.20260911.1/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// ../node_modules/.pnpm/wrangler@4.131.2_@cloudflare+workers-types@5.20260914.1_@types+node@24.10.4/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// ../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// ../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// ../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// ../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// ../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// ../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// ../node_modules/.pnpm/@cloudflare+unenv-preset@2.16.1_unenv@2.0.0-rc.24_workerd@1.20260911.1/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  _channel,
  _debugEnd,
  _debugProcess,
  _disconnect,
  _events,
  _eventsCount,
  _exiting,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _handleQueue,
  _kill,
  _linkedBinding,
  _maxListeners,
  _pendingMessage,
  _preload_modules,
  _rawDebug,
  _send,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  assert: assert2,
  availableMemory,
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  disconnect,
  dlopen,
  domain,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  hrtime: hrtime3,
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  mainModule,
  memoryUsage,
  moduleLoadList,
  nextTick,
  off,
  on,
  once,
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// ../node_modules/.pnpm/wrangler@4.131.2_@cloudflare+workers-types@5.20260914.1_@types+node@24.10.4/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// src/util.ts
var encoder = new TextEncoder();
var decoder = new TextDecoder();
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers }
  });
}
__name(json, "json");
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
__name(readJson, "readJson");
function withCors(request, response, env2) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env2.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Forge-Proxy");
  headers.set("Access-Control-Max-Age", "86400");
  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  return new Response(response.body, { status: response.status, headers });
}
__name(withCors, "withCors");
function b64url(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64url, "b64url");
function fromB64url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - padded.length % 4);
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
__name(fromB64url, "fromB64url");
function randomId(prefix = "") {
  return prefix + b64url(crypto.getRandomValues(new Uint8Array(16)));
}
__name(randomId, "randomId");
function randomToken(bytes = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}
__name(randomToken, "randomToken");
async function sha256Hex(input) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return b64url(bytes);
}
__name(sha256Hex, "sha256Hex");
async function hmacHex(input, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(input));
  return b64url(signature);
}
__name(hmacHex, "hmacHex");
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(timingSafeEqual, "timingSafeEqual");
var PBKDF2_ITERATIONS = 31e4;
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(bits)}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, stored) {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = fromB64url(parts[2]);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256
  );
  return timingSafeEqual(b64url(bits), parts[3]);
}
__name(verifyPassword, "verifyPassword");
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
__name(isValidEmail, "isValidEmail");
function normalizeUserCode(input) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
__name(normalizeUserCode, "normalizeUserCode");
var USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateUserCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((byte) => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}
__name(generateUserCode, "generateUserCode");

// src/device-relay.ts
var EMPTY_STATUS = { daemonOk: false, status: { active: [] }, lastSeenAt: null };
var HOP_BY_HOP = /* @__PURE__ */ new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);
var DeviceRelay = class {
  static {
    __name(this, "DeviceRelay");
  }
  state;
  env;
  pending = /* @__PURE__ */ new Map();
  deviceId = "";
  constructor(state, env2) {
    this.state = state;
    this.env = env2;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/connect") return this.connectSocket(request);
    if (url.pathname === "/rpc" && request.method === "POST") return this.rpc(request);
    if (url.pathname === "/status") return json(await this.getStatus());
    if (url.pathname === "/events") return this.events(request.signal);
    return json({ error: "Not found" }, 404);
  }
  async webSocketMessage(_socket, message) {
    let payload;
    try {
      const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const now = Date.now();
    if (payload.type === "hello" || payload.type === "heartbeat") {
      const status = {
        daemonOk: Boolean(payload.daemonOk),
        status: payload.status ?? { active: [] },
        lastSeenAt: now
      };
      await this.state.storage.put("status", status);
      if (this.deviceId) {
        await this.env.DB.prepare("UPDATE devices SET daemon_ok = ?, last_seen_at = ? WHERE id = ?").bind(status.daemonOk ? 1 : 0, now, this.deviceId).run();
      }
      return;
    }
    if (payload.type !== "result" || typeof payload.id !== "string") return;
    const pending = this.pending.get(payload.id);
    if (!pending) return;
    this.pending.delete(payload.id);
    clearTimeout(pending.timer);
    if (payload.error) {
      pending.resolve(json({ error: String(payload.error) }, 502));
      return;
    }
    const headers = new Headers();
    const sourceHeaders = payload.responseHeaders;
    if (sourceHeaders && typeof sourceHeaders === "object") {
      for (const [key, value] of Object.entries(sourceHeaders)) {
        if (!HOP_BY_HOP.has(key.toLowerCase()) && typeof value === "string") headers.set(key, value);
      }
    }
    if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
    pending.resolve(new Response(typeof payload.responseBody === "string" ? payload.responseBody : "", {
      status: typeof payload.responseStatus === "number" ? payload.responseStatus : 200,
      headers
    }));
  }
  async webSocketClose() {
    await this.markOffline();
  }
  async webSocketError() {
    await this.markOffline();
  }
  async connectSocket(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "WebSocket upgrade required" }, 426);
    }
    this.deviceId = request.headers.get("X-Forge-Device-Id") || this.deviceId;
    for (const existing of this.state.getWebSockets("laptop")) existing.close(4001, "Replaced by a newer connection");
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server, ["laptop"]);
    await this.state.storage.put("status", { ...EMPTY_STATUS, lastSeenAt: Date.now() });
    return new Response(null, { status: 101, webSocket: client });
  }
  async rpc(request) {
    const sockets = this.state.getWebSockets("laptop");
    const socket = sockets.at(0);
    if (!socket) return json({ error: "Laptop is offline" }, 503);
    const job = await request.json();
    const id = typeof job.id === "string" ? job.id : randomId("rpc_");
    const response = new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(json({ error: "Laptop did not answer in time" }, 504));
      }, 28e3);
      this.pending.set(id, { resolve, timer });
    });
    try {
      socket.send(JSON.stringify({ ...job, id, type: "rpc" }));
    } catch {
      const pending = this.pending.get(id);
      if (pending) clearTimeout(pending.timer);
      this.pending.delete(id);
      return json({ error: "Laptop connection was lost" }, 503);
    }
    return response;
  }
  async getStatus() {
    const saved = await this.state.storage.get("status") || EMPTY_STATUS;
    const online = this.state.getWebSockets("laptop").length > 0;
    return { ...saved, online };
  }
  events(signal) {
    const encoder2 = new TextEncoder();
    let timer;
    const stream = new ReadableStream({
      start: /* @__PURE__ */ __name(async (controller) => {
        const push = /* @__PURE__ */ __name(async () => {
          const status = await this.getStatus();
          controller.enqueue(encoder2.encode(`data: ${JSON.stringify(status.status)}

`));
        }, "push");
        await push();
        timer = setInterval(() => void push().catch(() => {
        }), 2500);
        setTimeout(() => {
          if (timer) clearInterval(timer);
          try {
            controller.close();
          } catch {
          }
        }, 22e3);
        signal.addEventListener("abort", () => {
          if (timer) clearInterval(timer);
          try {
            controller.close();
          } catch {
          }
        }, { once: true });
      }, "start"),
      cancel: /* @__PURE__ */ __name(() => {
        if (timer) clearInterval(timer);
      }, "cancel")
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform"
      }
    });
  }
  async markOffline() {
    const saved = await this.state.storage.get("status") || EMPTY_STATUS;
    await this.state.storage.put("status", { ...saved, lastSeenAt: Date.now() });
  }
};

// src/index.ts
var SESSION_COOKIE = "forge_session";
var SESSION_TTL = 30 * 24 * 60 * 60 * 1e3;
var PAIR_TTL = 10 * 60 * 1e3;
var MAX_BODY_BYTES = 1e6;
var SAFE_RPC_HEADERS = /* @__PURE__ */ new Set(["accept", "content-type", "if-none-match", "if-modified-since", "range"]);
var src_default = {
  async fetch(request, env2) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return withCors(request, new Response(null, { status: 204 }), env2);
    let response;
    try {
      if (url.pathname === "/health") response = json({ ok: true, service: "forge-relay" });
      else if (url.pathname === "/v1/auth/signup" && request.method === "POST") response = await signUp(request, env2);
      else if (url.pathname === "/v1/auth/signin" && request.method === "POST") response = await signIn(request, env2);
      else if (url.pathname === "/v1/auth/signout" && request.method === "POST") response = await signOut(request, env2);
      else if (url.pathname === "/v1/auth/session" && request.method === "GET") response = await getSessionResponse(request, env2);
      else if (url.pathname === "/v1/pair/start" && request.method === "POST") response = await startPairing(request, env2);
      else if (url.pathname === "/v1/pair/poll" && request.method === "POST") response = await pollPairing(request, env2);
      else if (url.pathname === "/v1/pair/claim" && request.method === "POST") response = await claimPairing(request, env2);
      else if (url.pathname === "/v1/devices" && request.method === "GET") response = await listDevices(request, env2);
      else if (/^\/v1\/devices\/[^/]+$/.test(url.pathname) && request.method === "GET") response = await getDevice(request, env2);
      else if (/^\/v1\/devices\/[^/]+$/.test(url.pathname) && request.method === "DELETE") response = await deleteDevice(request, env2);
      else if (/^\/v1\/devices\/[^/]+\/rpc(?:\/.*)?$/.test(url.pathname)) response = await relayRpc(request, env2);
      else if (/^\/v1\/devices\/[^/]+\/events$/.test(url.pathname) && request.method === "GET") response = await deviceEvents(request, env2);
      else if (url.pathname === "/v1/device/connect" && request.method === "GET") response = await connectDevice(request, env2);
      else response = json({ error: "Not found" }, 404);
    } catch (error3) {
      console.error("Forge Worker request failed", error3);
      response = json({ error: "Internal server error" }, 500);
    }
    if (response.status === 101) return response;
    return withCors(request, response, env2);
  }
};
async function signUp(request, env2) {
  if (!isTrustedProxy(request, env2)) return json({ error: "Forbidden" }, 403);
  if (!await rateLimit(env2, `signup:${clientIdentity(request)}`, 5, 60 * 60 * 1e3)) {
    return json({ error: "Too many account attempts. Try again later." }, 429);
  }
  const body = await readJson(request);
  const email = body?.email?.trim().toLowerCase() || "";
  const password = body?.password || "";
  if (!isValidEmail(email) || password.length < 12 || password.length > 128) {
    return json({ error: "Use a valid email and a password between 12 and 128 characters" }, 400);
  }
  const existing = await env2.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return json({ error: "An account with this email already exists" }, 409);
  const userId = randomId("usr_");
  const now = Date.now();
  const passwordHash = await hashPassword(password);
  await env2.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").bind(userId, email, passwordHash, now).run();
  return createSession(env2, { id: userId, email }, 201);
}
__name(signUp, "signUp");
async function signIn(request, env2) {
  if (!isTrustedProxy(request, env2)) return json({ error: "Forbidden" }, 403);
  if (!await rateLimit(env2, `signin:${clientIdentity(request)}`, 20, 10 * 60 * 1e3)) {
    return json({ error: "Too many sign-in attempts. Try again later." }, 429);
  }
  const body = await readJson(request);
  const email = body?.email?.trim().toLowerCase() || "";
  const password = body?.password || "";
  const user = await env2.DB.prepare("SELECT id, email, password_hash, created_at FROM users WHERE email = ?").bind(email).first();
  if (!user) {
    await hashPassword(password);
    return json({ error: "Email or password is incorrect" }, 401);
  }
  if (!await verifyPassword(password, user.password_hash)) {
    return json({ error: "Email or password is incorrect" }, 401);
  }
  return createSession(env2, { id: user.id, email: user.email });
}
__name(signIn, "signIn");
async function signOut(request, env2) {
  if (!isTrustedProxy(request, env2)) return json({ error: "Forbidden" }, 403);
  const token = cookie(request, SESSION_COOKIE);
  if (token) await env2.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
}
__name(signOut, "signOut");
async function getSessionResponse(request, env2) {
  if (!isTrustedProxy(request, env2)) return json({ error: "Forbidden" }, 403);
  const session = await authenticate(request, env2);
  return session ? json({ user: session.user }) : json({ user: null }, 401);
}
__name(getSessionResponse, "getSessionResponse");
async function createSession(env2, user, status = 200) {
  const token = randomToken(32);
  const now = Date.now();
  await env2.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").bind(randomId("ses_"), user.id, await sha256Hex(token), now + SESSION_TTL, now).run();
  return json({ user }, status, { "set-cookie": sessionCookie(token) });
}
__name(createSession, "createSession");
async function startPairing(request, env2) {
  if (!await rateLimit(env2, `pair:${clientIdentity(request)}`, 20, 60 * 60 * 1e3)) {
    return json({ error: "Too many pairing attempts. Try again later." }, 429);
  }
  const body = await readJson(request);
  const name = cleanLabel(body?.name, 100);
  const platform2 = cleanLabel(body?.platform, 40);
  const deviceCode = randomToken(32);
  const now = Date.now();
  let userCode = generateUserCode();
  for (let tries = 0; tries < 4; tries += 1) {
    const exists = await env2.DB.prepare("SELECT id FROM pairing_codes WHERE user_code = ?").bind(userCode).first();
    if (!exists) break;
    userCode = generateUserCode();
  }
  await env2.DB.prepare(`INSERT INTO pairing_codes
    (id, device_code_hash, user_code, device_name, platform, device_token_hash, status, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, '', 'pending', ?, ?)`).bind(randomId("pair_"), await sha256Hex(deviceCode), userCode, name, platform2, now + PAIR_TTL, now).run();
  return json({
    deviceCode,
    userCode,
    verificationUri: `${env2.APP_URL.replace(/\/$/, "")}/pair`,
    verificationUriComplete: `${env2.APP_URL.replace(/\/$/, "")}/pair?code=${encodeURIComponent(userCode)}`,
    expiresIn: PAIR_TTL / 1e3,
    interval: 3
  }, 201);
}
__name(startPairing, "startPairing");
async function pollPairing(request, env2) {
  const body = await readJson(request);
  if (!body?.deviceCode) return json({ error: "deviceCode is required" }, 400);
  const row = await env2.DB.prepare("SELECT * FROM pairing_codes WHERE device_code_hash = ?").bind(await sha256Hex(body.deviceCode)).first();
  if (!row || row.expires_at < Date.now()) return json({ status: "expired" }, 410);
  if (row.status !== "approved" || !row.device_id) return json({ status: "pending" }, 202);
  const token = await deriveDeviceToken(await sha256Hex(body.deviceCode), row.device_id, env2.BETTER_AUTH_SECRET);
  return json({
    status: "approved",
    deviceId: row.device_id,
    deviceToken: token,
    websocketUrl: `${new URL(request.url).origin}/v1/device/connect?deviceId=${encodeURIComponent(row.device_id)}`
  });
}
__name(pollPairing, "pollPairing");
async function claimPairing(request, env2) {
  if (!isTrustedProxy(request, env2)) return json({ error: "Forbidden" }, 403);
  const session = await authenticate(request, env2);
  if (!session) return json({ error: "Sign in required" }, 401);
  const body = await readJson(request);
  const userCode = normalizeUserCode(body?.userCode || "");
  if (userCode.length !== 8) return json({ error: "Enter the 8-character pairing code" }, 400);
  const formatted = `${userCode.slice(0, 4)}-${userCode.slice(4)}`;
  const pair = await env2.DB.prepare("SELECT * FROM pairing_codes WHERE user_code = ?").bind(formatted).first();
  if (!pair || pair.expires_at < Date.now()) return json({ error: "This pairing code is invalid or expired" }, 404);
  if (pair.status !== "pending") return json({ error: "This pairing code was already used" }, 409);
  const deviceId = randomId("dev_");
  const derivedToken = await deriveDeviceTokenHashFromPair(pair, deviceId, env2);
  const now = Date.now();
  await env2.DB.batch([
    env2.DB.prepare(`INSERT INTO devices
      (id, user_id, name, platform, device_token_hash, daemon_ok, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)`).bind(deviceId, session.user.id, pair.device_name, pair.platform, derivedToken, now),
    env2.DB.prepare(`UPDATE pairing_codes SET status = 'approved', user_id = ?, device_id = ?
      WHERE id = ? AND status = 'pending'`).bind(session.user.id, deviceId, pair.id)
  ]);
  return json({ ok: true, deviceId });
}
__name(claimPairing, "claimPairing");
async function listDevices(request, env2) {
  if (!isTrustedProxy(request, env2)) return json({ error: "Forbidden" }, 403);
  const session = await authenticate(request, env2);
  if (!session) return json({ error: "Sign in required" }, 401);
  const result = await env2.DB.prepare(`SELECT id, name, platform, daemon_ok, last_seen_at, created_at
    FROM devices WHERE user_id = ? ORDER BY created_at DESC`).bind(session.user.id).all();
  const devices = await Promise.all(result.results.map(async (row) => {
    const status = await deviceStub(env2, String(row.id)).fetch("https://device/status");
    const live = await status.json();
    return { ...row, online: Boolean(live.online), daemonOk: Boolean(live.daemonOk), lastSeenAt: live.lastSeenAt || row.last_seen_at };
  }));
  return json({ devices });
}
__name(listDevices, "listDevices");
async function getDevice(request, env2) {
  if (!isTrustedProxy(request, env2)) return json({ error: "Forbidden" }, 403);
  const session = await authenticate(request, env2);
  if (!session) return json({ error: "Sign in required" }, 401);
  const deviceId = pathPart(request, 3);
  const device = await ownedDevice(env2, deviceId, session.user.id);
  if (!device) return json({ error: "Device not found" }, 404);
  const liveResponse = await deviceStub(env2, deviceId).fetch("https://device/status");
  const live = await liveResponse.json();
  return json({ ...publicDevice(device), ...live });
}
__name(getDevice, "getDevice");
async function deleteDevice(request, env2) {
  if (!isTrustedProxy(request, env2)) return json({ error: "Forbidden" }, 403);
  const session = await authenticate(request, env2);
  if (!session) return json({ error: "Sign in required" }, 401);
  const deviceId = pathPart(request, 3);
  const result = await env2.DB.prepare("DELETE FROM devices WHERE id = ? AND user_id = ?").bind(deviceId, session.user.id).run();
  return result.meta.changes ? json({ ok: true }) : json({ error: "Device not found" }, 404);
}
__name(deleteDevice, "deleteDevice");
async function connectDevice(request, env2) {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId") || "";
  const token = bearer(request);
  if (!deviceId || !token) return json({ error: "Device credentials required" }, 401);
  const device = await env2.DB.prepare("SELECT * FROM devices WHERE id = ?").bind(deviceId).first();
  if (!device || !timingSafeEqual(await sha256Hex(token), device.device_token_hash)) return json({ error: "Invalid device credentials" }, 401);
  const headers = new Headers(request.headers);
  headers.set("X-Forge-Device-Id", deviceId);
  return deviceStub(env2, deviceId).fetch(new Request("https://device/connect", { headers }));
}
__name(connectDevice, "connectDevice");
async function relayRpc(request, env2) {
  if (!isTrustedProxy(request, env2)) return json({ error: "Forbidden" }, 403);
  const session = await authenticate(request, env2);
  if (!session) return json({ error: "Sign in required" }, 401);
  const url = new URL(request.url);
  const deviceId = pathPart(request, 3);
  if (!await ownedDevice(env2, deviceId, session.user.id)) return json({ error: "Device not found" }, 404);
  const prefix = `/v1/devices/${deviceId}/rpc`;
  const rpcPath = url.pathname.slice(prefix.length) || "/";
  if (rpcPath.startsWith("/internal")) return json({ error: "Forbidden" }, 403);
  if (rpcPath === "/sse/status" && request.method === "GET") {
    return deviceStub(env2, deviceId).fetch("https://device/events");
  }
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) return json({ error: "Payload too large" }, 413);
  const requestBody = request.method === "GET" || request.method === "HEAD" ? null : await request.text();
  if (requestBody && new TextEncoder().encode(requestBody).byteLength > MAX_BODY_BYTES) return json({ error: "Payload too large" }, 413);
  const headers = {};
  for (const [key, value] of request.headers) if (SAFE_RPC_HEADERS.has(key.toLowerCase())) headers[key] = value;
  return deviceStub(env2, deviceId).fetch("https://device/rpc", {
    method: "POST",
    body: JSON.stringify({
      id: randomId("rpc_"),
      method: request.method,
      path: rpcPath,
      query: url.searchParams.toString(),
      headers,
      body: requestBody
    }),
    headers: { "content-type": "application/json" }
  });
}
__name(relayRpc, "relayRpc");
async function deviceEvents(request, env2) {
  if (!isTrustedProxy(request, env2)) return json({ error: "Forbidden" }, 403);
  const session = await authenticate(request, env2);
  if (!session) return json({ error: "Sign in required" }, 401);
  const deviceId = pathPart(request, 3);
  if (!await ownedDevice(env2, deviceId, session.user.id)) return json({ error: "Device not found" }, 404);
  return deviceStub(env2, deviceId).fetch("https://device/events");
}
__name(deviceEvents, "deviceEvents");
async function authenticate(request, env2) {
  const token = cookie(request, SESSION_COOKIE);
  if (!token) return null;
  const now = Date.now();
  const row = await env2.DB.prepare(`SELECT users.id, users.email, sessions.expires_at
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).bind(await sha256Hex(token), now).first();
  if (!row) return null;
  return { user: { id: row.id, email: row.email }, token };
}
__name(authenticate, "authenticate");
async function ownedDevice(env2, deviceId, userId) {
  return env2.DB.prepare("SELECT * FROM devices WHERE id = ? AND user_id = ?").bind(deviceId, userId).first();
}
__name(ownedDevice, "ownedDevice");
function publicDevice(device) {
  return {
    id: device.id,
    name: device.name,
    platform: device.platform,
    daemonOk: Boolean(device.daemon_ok),
    lastSeenAt: device.last_seen_at,
    createdAt: device.created_at
  };
}
__name(publicDevice, "publicDevice");
function deviceStub(env2, deviceId) {
  return env2.DEVICE.get(env2.DEVICE.idFromName(deviceId));
}
__name(deviceStub, "deviceStub");
async function deriveDeviceToken(deviceCodeHash, deviceId, secret) {
  return `${deviceId}.${await hmacHex(`${deviceCodeHash}.${deviceId}`, secret)}`;
}
__name(deriveDeviceToken, "deriveDeviceToken");
async function deriveDeviceTokenHashFromPair(pair, deviceId, env2) {
  const token = await deriveDeviceToken(pair.device_code_hash, deviceId, env2.BETTER_AUTH_SECRET);
  return sha256Hex(token);
}
__name(deriveDeviceTokenHashFromPair, "deriveDeviceTokenHashFromPair");
async function rateLimit(env2, rawKey, limit, windowMs) {
  const key = await sha256Hex(rawKey);
  const now = Date.now();
  const resetAt = now + windowMs;
  await env2.DB.prepare(`INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= ? THEN ? ELSE rate_limits.reset_at END`).bind(key, resetAt, now, now, resetAt).run();
  const row = await env2.DB.prepare("SELECT count FROM rate_limits WHERE key = ?").bind(key).first();
  return Boolean(row && row.count <= limit);
}
__name(rateLimit, "rateLimit");
function clientIdentity(request) {
  return request.headers.get("X-Forge-Client-IP") || request.headers.get("CF-Connecting-IP") || "unknown-client";
}
__name(clientIdentity, "clientIdentity");
function isTrustedProxy(request, env2) {
  const provided = request.headers.get("X-Forge-Proxy") || "";
  return Boolean(env2.WORKER_PROXY_SECRET) && timingSafeEqual(provided, env2.WORKER_PROXY_SECRET);
}
__name(isTrustedProxy, "isTrustedProxy");
function cookie(request, name) {
  const source = request.headers.get("Cookie") || "";
  for (const item of source.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}
__name(cookie, "cookie");
function bearer(request) {
  const header = request.headers.get("Authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}
__name(bearer, "bearer");
function sessionCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL / 1e3}`;
}
__name(sessionCookie, "sessionCookie");
function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
__name(clearSessionCookie, "clearSessionCookie");
function pathPart(request, index) {
  return new URL(request.url).pathname.split("/").filter(Boolean)[index - 1] || "";
}
__name(pathPart, "pathPart");
function cleanLabel(value, max) {
  const cleaned = value?.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
  return cleaned || null;
}
__name(cleanLabel, "cleanLabel");

// ../node_modules/.pnpm/wrangler@4.131.2_@cloudflare+workers-types@5.20260914.1_@types+node@24.10.4/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env2, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env2);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/.pnpm/wrangler@4.131.2_@cloudflare+workers-types@5.20260914.1_@types+node@24.10.4/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env2, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env2);
  } catch (e) {
    const error3 = reduceError(e);
    const body = JSON.stringify(error3);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-i5hezx/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../node_modules/.pnpm/wrangler@4.131.2_@cloudflare+workers-types@5.20260914.1_@types+node@24.10.4/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env2, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env2, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env2, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env2, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-i5hezx/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env2, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env2, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env2, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env2, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env2, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env2, ctx) => {
      this.env = env2;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  DeviceRelay,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
