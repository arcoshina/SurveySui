var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
var init_utils = __esm({
  "../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/_internal/utils.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(createNotImplementedError, "createNotImplementedError");
    __name(notImplemented, "notImplemented");
    __name(notImplementedClass, "notImplementedClass");
  }
});

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin, _performanceNow, nodeTiming, PerformanceEntry, PerformanceMark, PerformanceMeasure, PerformanceResourceTiming, PerformanceObserverEntryList, Performance, PerformanceObserver, performance;
var init_performance = __esm({
  "../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_utils();
    _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
    _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
    nodeTiming = {
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
    PerformanceEntry = class {
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
    PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
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
    PerformanceMeasure = class extends PerformanceEntry {
      static {
        __name(this, "PerformanceMeasure");
      }
      entryType = "measure";
    };
    PerformanceResourceTiming = class extends PerformanceEntry {
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
    PerformanceObserverEntryList = class {
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
    Performance = class {
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
      timerify(_fn, _options2) {
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
    PerformanceObserver = class {
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
    performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();
  }
});

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/perf_hooks.mjs
var init_perf_hooks = __esm({
  "../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/perf_hooks.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_performance();
  }
});

// ../../node_modules/.pnpm/@cloudflare+unenv-preset@2.16.1_unenv@2.0.0-rc.24_workerd@1.20260603.1/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
var init_performance2 = __esm({
  "../../node_modules/.pnpm/@cloudflare+unenv-preset@2.16.1_unenv@2.0.0-rc.24_workerd@1.20260603.1/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs"() {
    init_perf_hooks();
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
  }
});

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default;
var init_noop = __esm({
  "../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/mock/noop.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    noop_default = Object.assign(() => {
    }, { __unenv__: true });
  }
});

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";
var _console, _ignoreErrors, _stderr, _stdout, log, info, trace, debug, table, error, warn, createTask, clear, count, countReset, dir, dirxml, group, groupEnd, groupCollapsed, profile, profileEnd, time, timeEnd, timeLog, timeStamp, Console, _times, _stdoutErrorHandler, _stderrErrorHandler;
var init_console = __esm({
  "../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/console.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_noop();
    init_utils();
    _console = globalThis.console;
    _ignoreErrors = true;
    _stderr = new Writable();
    _stdout = new Writable();
    log = _console?.log ?? noop_default;
    info = _console?.info ?? log;
    trace = _console?.trace ?? info;
    debug = _console?.debug ?? log;
    table = _console?.table ?? log;
    error = _console?.error ?? log;
    warn = _console?.warn ?? error;
    createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
    clear = _console?.clear ?? noop_default;
    count = _console?.count ?? noop_default;
    countReset = _console?.countReset ?? noop_default;
    dir = _console?.dir ?? noop_default;
    dirxml = _console?.dirxml ?? noop_default;
    group = _console?.group ?? noop_default;
    groupEnd = _console?.groupEnd ?? noop_default;
    groupCollapsed = _console?.groupCollapsed ?? noop_default;
    profile = _console?.profile ?? noop_default;
    profileEnd = _console?.profileEnd ?? noop_default;
    time = _console?.time ?? noop_default;
    timeEnd = _console?.timeEnd ?? noop_default;
    timeLog = _console?.timeLog ?? noop_default;
    timeStamp = _console?.timeStamp ?? noop_default;
    Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
    _times = /* @__PURE__ */ new Map();
    _stdoutErrorHandler = noop_default;
    _stderrErrorHandler = noop_default;
  }
});

// ../../node_modules/.pnpm/@cloudflare+unenv-preset@2.16.1_unenv@2.0.0-rc.24_workerd@1.20260603.1/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole, assert, clear2, context, count2, countReset2, createTask2, debug2, dir2, dirxml2, error2, group2, groupCollapsed2, groupEnd2, info2, log2, profile2, profileEnd2, table2, time2, timeEnd2, timeLog2, timeStamp2, trace2, warn2, console_default;
var init_console2 = __esm({
  "../../node_modules/.pnpm/@cloudflare+unenv-preset@2.16.1_unenv@2.0.0-rc.24_workerd@1.20260603.1/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_console();
    workerdConsole = globalThis["console"];
    ({
      assert,
      clear: clear2,
      context: (
        // @ts-expect-error undocumented public API
        context
      ),
      count: count2,
      countReset: countReset2,
      createTask: (
        // @ts-expect-error undocumented public API
        createTask2
      ),
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
    } = workerdConsole);
    Object.assign(workerdConsole, {
      Console,
      _ignoreErrors,
      _stderr,
      _stderrErrorHandler,
      _stdout,
      _stdoutErrorHandler,
      _times
    });
    console_default = workerdConsole;
  }
});

// ../../node_modules/.pnpm/wrangler@4.98.0_@cloudflare+workers-types@4.20260607.1/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
var init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console = __esm({
  "../../node_modules/.pnpm/wrangler@4.98.0_@cloudflare+workers-types@4.20260607.1/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console"() {
    init_console2();
    globalThis.console = console_default;
  }
});

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime;
var init_hrtime = __esm({
  "../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
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
  }
});

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream;
var init_read_stream = __esm({
  "../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    ReadStream = class {
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
  }
});

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream;
var init_write_stream = __esm({
  "../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    WriteStream = class {
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
  }
});

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/tty.mjs
var init_tty = __esm({
  "../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/tty.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_read_stream();
    init_write_stream();
  }
});

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION;
var init_node_version = __esm({
  "../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    NODE_VERSION = "22.14.0";
  }
});

// ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";
var Process;
var init_process = __esm({
  "../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/process/process.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_tty();
    init_utils();
    init_node_version();
    Process = class _Process extends EventEmitter {
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
  }
});

// ../../node_modules/.pnpm/@cloudflare+unenv-preset@2.16.1_unenv@2.0.0-rc.24_workerd@1.20260603.1/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess, getBuiltinModule, workerdProcess, unenvProcess, exit, features, platform, _channel, _debugEnd, _debugProcess, _disconnect, _events, _eventsCount, _exiting, _fatalException, _getActiveHandles, _getActiveRequests, _handleQueue, _kill, _linkedBinding, _maxListeners, _pendingMessage, _preload_modules, _rawDebug, _send, _startProfilerIdleNotifier, _stopProfilerIdleNotifier, _tickCallback, abort, addListener, allowedNodeEnvironmentFlags, arch, argv, argv0, assert2, availableMemory, binding, channel, chdir, config, connected, constrainedMemory, cpuUsage, cwd, debugPort, disconnect, dlopen, domain, emit, emitWarning, env, eventNames, execArgv, execPath, exitCode, finalization, getActiveResourcesInfo, getegid, geteuid, getgid, getgroups, getMaxListeners, getuid, hasUncaughtExceptionCaptureCallback, hrtime3, initgroups, kill, listenerCount, listeners, loadEnvFile, mainModule, memoryUsage, moduleLoadList, nextTick, off, on, once, openStdin, permission, pid, ppid, prependListener, prependOnceListener, rawListeners, reallyExit, ref, release, removeAllListeners, removeListener, report, resourceUsage, send, setegid, seteuid, setgid, setgroups, setMaxListeners, setSourceMapsEnabled, setuid, setUncaughtExceptionCaptureCallback, sourceMapsEnabled, stderr, stdin, stdout, throwDeprecation, title, traceDeprecation, umask, unref, uptime, version, versions, _process, process_default;
var init_process2 = __esm({
  "../../node_modules/.pnpm/@cloudflare+unenv-preset@2.16.1_unenv@2.0.0-rc.24_workerd@1.20260603.1/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_hrtime();
    init_process();
    globalProcess = globalThis["process"];
    getBuiltinModule = globalProcess.getBuiltinModule;
    workerdProcess = getBuiltinModule("node:process");
    unenvProcess = new Process({
      env: globalProcess.env,
      hrtime,
      // `nextTick` is available from workerd process v1
      nextTick: workerdProcess.nextTick
    });
    ({ exit, features, platform } = workerdProcess);
    ({
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
    } = unenvProcess);
    _process = {
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
    process_default = _process;
  }
});

// ../../node_modules/.pnpm/wrangler@4.98.0_@cloudflare+workers-types@4.20260607.1/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
var init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process = __esm({
  "../../node_modules/.pnpm/wrangler@4.98.0_@cloudflare+workers-types@4.20260607.1/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process"() {
    init_process2();
    globalThis.process = process_default;
  }
});

// wrangler-modules-watch:wrangler:modules-watch
var init_wrangler_modules_watch = __esm({
  "wrangler-modules-watch:wrangler:modules-watch"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
  }
});

// ../../node_modules/.pnpm/wrangler@4.98.0_@cloudflare+workers-types@4.20260607.1/node_modules/wrangler/templates/modules-watch-stub.js
var init_modules_watch_stub = __esm({
  "../../node_modules/.pnpm/wrangler@4.98.0_@cloudflare+workers-types@4.20260607.1/node_modules/wrangler/templates/modules-watch-stub.js"() {
    init_wrangler_modules_watch();
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/version.js
var PACKAGE_VERSION, TARGETED_RPC_VERSION;
var init_version = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/version.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    PACKAGE_VERSION = "1.45.2";
    TARGETED_RPC_VERSION = "1.62.0";
  }
});

// ../../node_modules/.pnpm/@scure+base@1.2.6/node_modules/@scure/base/lib/esm/index.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function isArrayOf(isString, arr) {
  if (!Array.isArray(arr))
    return false;
  if (arr.length === 0)
    return true;
  if (isString) {
    return arr.every((item) => typeof item === "string");
  } else {
    return arr.every((item) => Number.isSafeInteger(item));
  }
}
function afn(input) {
  if (typeof input !== "function")
    throw new Error("function expected");
  return true;
}
function astr(label, input) {
  if (typeof input !== "string")
    throw new Error(`${label}: string expected`);
  return true;
}
function anumber(n) {
  if (!Number.isSafeInteger(n))
    throw new Error(`invalid integer: ${n}`);
}
function aArr(input) {
  if (!Array.isArray(input))
    throw new Error("array expected");
}
function astrArr(label, input) {
  if (!isArrayOf(true, input))
    throw new Error(`${label}: array of strings expected`);
}
function anumArr(label, input) {
  if (!isArrayOf(false, input))
    throw new Error(`${label}: array of numbers expected`);
}
// @__NO_SIDE_EFFECTS__
function chain(...args) {
  const id = /* @__PURE__ */ __name((a) => a, "id");
  const wrap = /* @__PURE__ */ __name((a, b) => (c) => a(b(c)), "wrap");
  const encode = args.map((x) => x.encode).reduceRight(wrap, id);
  const decode = args.map((x) => x.decode).reduce(wrap, id);
  return { encode, decode };
}
// @__NO_SIDE_EFFECTS__
function alphabet(letters) {
  const lettersA = typeof letters === "string" ? letters.split("") : letters;
  const len = lettersA.length;
  astrArr("alphabet", lettersA);
  const indexes = new Map(lettersA.map((l, i) => [l, i]));
  return {
    encode: /* @__PURE__ */ __name((digits) => {
      aArr(digits);
      return digits.map((i) => {
        if (!Number.isSafeInteger(i) || i < 0 || i >= len)
          throw new Error(`alphabet.encode: digit index outside alphabet "${i}". Allowed: ${letters}`);
        return lettersA[i];
      });
    }, "encode"),
    decode: /* @__PURE__ */ __name((input) => {
      aArr(input);
      return input.map((letter) => {
        astr("alphabet.decode", letter);
        const i = indexes.get(letter);
        if (i === void 0)
          throw new Error(`Unknown letter: "${letter}". Allowed: ${letters}`);
        return i;
      });
    }, "decode")
  };
}
// @__NO_SIDE_EFFECTS__
function join(separator = "") {
  astr("join", separator);
  return {
    encode: /* @__PURE__ */ __name((from) => {
      astrArr("join.decode", from);
      return from.join(separator);
    }, "encode"),
    decode: /* @__PURE__ */ __name((to) => {
      astr("join.decode", to);
      return to.split(separator);
    }, "decode")
  };
}
function convertRadix(data, from, to) {
  if (from < 2)
    throw new Error(`convertRadix: invalid from=${from}, base cannot be less than 2`);
  if (to < 2)
    throw new Error(`convertRadix: invalid to=${to}, base cannot be less than 2`);
  aArr(data);
  if (!data.length)
    return [];
  let pos = 0;
  const res = [];
  const digits = Array.from(data, (d) => {
    anumber(d);
    if (d < 0 || d >= from)
      throw new Error(`invalid integer: ${d}`);
    return d;
  });
  const dlen = digits.length;
  while (true) {
    let carry = 0;
    let done = true;
    for (let i = pos; i < dlen; i++) {
      const digit = digits[i];
      const fromCarry = from * carry;
      const digitBase = fromCarry + digit;
      if (!Number.isSafeInteger(digitBase) || fromCarry / from !== carry || digitBase - digit !== fromCarry) {
        throw new Error("convertRadix: carry overflow");
      }
      const div = digitBase / to;
      carry = digitBase % to;
      const rounded = Math.floor(div);
      digits[i] = rounded;
      if (!Number.isSafeInteger(rounded) || rounded * to + carry !== digitBase)
        throw new Error("convertRadix: carry overflow");
      if (!done)
        continue;
      else if (!rounded)
        pos = i;
      else
        done = false;
    }
    res.push(carry);
    if (done)
      break;
  }
  for (let i = 0; i < data.length - 1 && data[i] === 0; i++)
    res.push(0);
  return res.reverse();
}
function convertRadix2(data, from, to, padding) {
  aArr(data);
  if (from <= 0 || from > 32)
    throw new Error(`convertRadix2: wrong from=${from}`);
  if (to <= 0 || to > 32)
    throw new Error(`convertRadix2: wrong to=${to}`);
  if (/* @__PURE__ */ radix2carry(from, to) > 32) {
    throw new Error(`convertRadix2: carry overflow from=${from} to=${to} carryBits=${/* @__PURE__ */ radix2carry(from, to)}`);
  }
  let carry = 0;
  let pos = 0;
  const max = powers[from];
  const mask = powers[to] - 1;
  const res = [];
  for (const n of data) {
    anumber(n);
    if (n >= max)
      throw new Error(`convertRadix2: invalid data word=${n} from=${from}`);
    carry = carry << from | n;
    if (pos + from > 32)
      throw new Error(`convertRadix2: carry overflow pos=${pos} from=${from}`);
    pos += from;
    for (; pos >= to; pos -= to)
      res.push((carry >> pos - to & mask) >>> 0);
    const pow = powers[pos];
    if (pow === void 0)
      throw new Error("invalid carry");
    carry &= pow - 1;
  }
  carry = carry << to - pos & mask;
  if (!padding && pos >= from)
    throw new Error("Excess padding");
  if (!padding && carry > 0)
    throw new Error(`Non-zero padding: ${carry}`);
  if (padding && pos > 0)
    res.push(carry >>> 0);
  return res;
}
// @__NO_SIDE_EFFECTS__
function radix(num) {
  anumber(num);
  const _256 = 2 ** 8;
  return {
    encode: /* @__PURE__ */ __name((bytes) => {
      if (!isBytes(bytes))
        throw new Error("radix.encode input should be Uint8Array");
      return convertRadix(Array.from(bytes), _256, num);
    }, "encode"),
    decode: /* @__PURE__ */ __name((digits) => {
      anumArr("radix.decode", digits);
      return Uint8Array.from(convertRadix(digits, num, _256));
    }, "decode")
  };
}
// @__NO_SIDE_EFFECTS__
function radix2(bits, revPadding = false) {
  anumber(bits);
  if (bits <= 0 || bits > 32)
    throw new Error("radix2: bits should be in (0..32]");
  if (/* @__PURE__ */ radix2carry(8, bits) > 32 || /* @__PURE__ */ radix2carry(bits, 8) > 32)
    throw new Error("radix2: carry overflow");
  return {
    encode: /* @__PURE__ */ __name((bytes) => {
      if (!isBytes(bytes))
        throw new Error("radix2.encode input should be Uint8Array");
      return convertRadix2(Array.from(bytes), 8, bits, !revPadding);
    }, "encode"),
    decode: /* @__PURE__ */ __name((digits) => {
      anumArr("radix2.decode", digits);
      return Uint8Array.from(convertRadix2(digits, bits, 8, revPadding));
    }, "decode")
  };
}
function unsafeWrapper(fn) {
  afn(fn);
  return function(...args) {
    try {
      return fn.apply(null, args);
    } catch (e) {
    }
  };
}
function bech32Polymod(pre) {
  const b = pre >> 25;
  let chk = (pre & 33554431) << 5;
  for (let i = 0; i < POLYMOD_GENERATORS.length; i++) {
    if ((b >> i & 1) === 1)
      chk ^= POLYMOD_GENERATORS[i];
  }
  return chk;
}
function bechChecksum(prefix, words, encodingConst = 1) {
  const len = prefix.length;
  let chk = 1;
  for (let i = 0; i < len; i++) {
    const c = prefix.charCodeAt(i);
    if (c < 33 || c > 126)
      throw new Error(`Invalid prefix (${prefix})`);
    chk = bech32Polymod(chk) ^ c >> 5;
  }
  chk = bech32Polymod(chk);
  for (let i = 0; i < len; i++)
    chk = bech32Polymod(chk) ^ prefix.charCodeAt(i) & 31;
  for (let v of words)
    chk = bech32Polymod(chk) ^ v;
  for (let i = 0; i < 6; i++)
    chk = bech32Polymod(chk);
  chk ^= encodingConst;
  return BECH_ALPHABET.encode(convertRadix2([chk % powers[30]], 30, 5, false));
}
// @__NO_SIDE_EFFECTS__
function genBech32(encoding) {
  const ENCODING_CONST = encoding === "bech32" ? 1 : 734539939;
  const _words = /* @__PURE__ */ radix2(5);
  const fromWords = _words.decode;
  const toWords = _words.encode;
  const fromWordsUnsafe = unsafeWrapper(fromWords);
  function encode(prefix, words, limit = 90) {
    astr("bech32.encode prefix", prefix);
    if (isBytes(words))
      words = Array.from(words);
    anumArr("bech32.encode", words);
    const plen = prefix.length;
    if (plen === 0)
      throw new TypeError(`Invalid prefix length ${plen}`);
    const actualLength = plen + 7 + words.length;
    if (limit !== false && actualLength > limit)
      throw new TypeError(`Length ${actualLength} exceeds limit ${limit}`);
    const lowered = prefix.toLowerCase();
    const sum = bechChecksum(lowered, words, ENCODING_CONST);
    return `${lowered}1${BECH_ALPHABET.encode(words)}${sum}`;
  }
  __name(encode, "encode");
  function decode(str, limit = 90) {
    astr("bech32.decode input", str);
    const slen = str.length;
    if (slen < 8 || limit !== false && slen > limit)
      throw new TypeError(`invalid string length: ${slen} (${str}). Expected (8..${limit})`);
    const lowered = str.toLowerCase();
    if (str !== lowered && str !== str.toUpperCase())
      throw new Error(`String must be lowercase or uppercase`);
    const sepIndex = lowered.lastIndexOf("1");
    if (sepIndex === 0 || sepIndex === -1)
      throw new Error(`Letter "1" must be present between prefix and data only`);
    const prefix = lowered.slice(0, sepIndex);
    const data = lowered.slice(sepIndex + 1);
    if (data.length < 6)
      throw new Error("Data must be at least 6 characters long");
    const words = BECH_ALPHABET.decode(data).slice(0, -6);
    const sum = bechChecksum(prefix, words, ENCODING_CONST);
    if (!data.endsWith(sum))
      throw new Error(`Invalid checksum in ${str}: expected "${sum}"`);
    return { prefix, words };
  }
  __name(decode, "decode");
  const decodeUnsafe = unsafeWrapper(decode);
  function decodeToBytes(str) {
    const { prefix, words } = decode(str, false);
    return { prefix, words, bytes: fromWords(words) };
  }
  __name(decodeToBytes, "decodeToBytes");
  function encodeFromBytes(prefix, bytes) {
    return encode(prefix, toWords(bytes));
  }
  __name(encodeFromBytes, "encodeFromBytes");
  return {
    encode,
    decode,
    encodeFromBytes,
    decodeToBytes,
    decodeUnsafe,
    fromWords,
    fromWordsUnsafe,
    toWords
  };
}
var gcd, radix2carry, powers, genBase58, base58, BECH_ALPHABET, POLYMOD_GENERATORS, bech32;
var init_esm = __esm({
  "../../node_modules/.pnpm/@scure+base@1.2.6/node_modules/@scure/base/lib/esm/index.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(isBytes, "isBytes");
    __name(isArrayOf, "isArrayOf");
    __name(afn, "afn");
    __name(astr, "astr");
    __name(anumber, "anumber");
    __name(aArr, "aArr");
    __name(astrArr, "astrArr");
    __name(anumArr, "anumArr");
    __name(chain, "chain");
    __name(alphabet, "alphabet");
    __name(join, "join");
    __name(convertRadix, "convertRadix");
    gcd = /* @__PURE__ */ __name((a, b) => b === 0 ? a : gcd(b, a % b), "gcd");
    radix2carry = /* @__PURE__ */ __name(/* @__NO_SIDE_EFFECTS__ */ (from, to) => from + (to - gcd(from, to)), "radix2carry");
    powers = /* @__PURE__ */ (() => {
      let res = [];
      for (let i = 0; i < 40; i++)
        res.push(2 ** i);
      return res;
    })();
    __name(convertRadix2, "convertRadix2");
    __name(radix, "radix");
    __name(radix2, "radix2");
    __name(unsafeWrapper, "unsafeWrapper");
    genBase58 = /* @__PURE__ */ __name(/* @__NO_SIDE_EFFECTS__ */ (abc) => /* @__PURE__ */ chain(/* @__PURE__ */ radix(58), /* @__PURE__ */ alphabet(abc), /* @__PURE__ */ join("")), "genBase58");
    base58 = /* @__PURE__ */ genBase58("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz");
    BECH_ALPHABET = /* @__PURE__ */ chain(/* @__PURE__ */ alphabet("qpzry9x8gf2tvdw0s3jn54khce6mua7l"), /* @__PURE__ */ join(""));
    POLYMOD_GENERATORS = [996825010, 642813549, 513874426, 1027748829, 705979059];
    __name(bech32Polymod, "bech32Polymod");
    __name(bechChecksum, "bechChecksum");
    __name(genBech32, "genBech32");
    bech32 = /* @__PURE__ */ genBech32("bech32");
  }
});

// ../../node_modules/.pnpm/@mysten+utils@0.2.0/node_modules/@mysten/utils/dist/esm/b58.js
var toBase58, fromBase58;
var init_b58 = __esm({
  "../../node_modules/.pnpm/@mysten+utils@0.2.0/node_modules/@mysten/utils/dist/esm/b58.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm();
    toBase58 = /* @__PURE__ */ __name((buffer) => base58.encode(buffer), "toBase58");
    fromBase58 = /* @__PURE__ */ __name((str) => base58.decode(str), "fromBase58");
  }
});

// ../../node_modules/.pnpm/@mysten+utils@0.2.0/node_modules/@mysten/utils/dist/esm/b64.js
function fromBase64(base64String2) {
  return Uint8Array.from(atob(base64String2), (char) => char.charCodeAt(0));
}
function toBase64(bytes) {
  if (bytes.length < CHUNK_SIZE) {
    return btoa(String.fromCharCode(...bytes));
  }
  let output = "";
  for (var i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk2 = bytes.slice(i, i + CHUNK_SIZE);
    output += String.fromCharCode(...chunk2);
  }
  return btoa(output);
}
var CHUNK_SIZE;
var init_b64 = __esm({
  "../../node_modules/.pnpm/@mysten+utils@0.2.0/node_modules/@mysten/utils/dist/esm/b64.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(fromBase64, "fromBase64");
    CHUNK_SIZE = 8192;
    __name(toBase64, "toBase64");
  }
});

// ../../node_modules/.pnpm/@mysten+utils@0.2.0/node_modules/@mysten/utils/dist/esm/hex.js
function fromHex(hexStr) {
  const normalized = hexStr.startsWith("0x") ? hexStr.slice(2) : hexStr;
  const padded = normalized.length % 2 === 0 ? normalized : `0${normalized}`;
  const intArr = padded.match(/[0-9a-fA-F]{2}/g)?.map((byte) => parseInt(byte, 16)) ?? [];
  if (intArr.length !== padded.length / 2) {
    throw new Error(`Invalid hex string ${hexStr}`);
  }
  return Uint8Array.from(intArr);
}
function toHex(bytes) {
  return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, "0"), "");
}
var init_hex = __esm({
  "../../node_modules/.pnpm/@mysten+utils@0.2.0/node_modules/@mysten/utils/dist/esm/hex.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(fromHex, "fromHex");
    __name(toHex, "toHex");
  }
});

// ../../node_modules/.pnpm/@mysten+utils@0.2.0/node_modules/@mysten/utils/dist/esm/chunk.js
function chunk(array2, size) {
  return Array.from({ length: Math.ceil(array2.length / size) }, (_, i) => {
    return array2.slice(i * size, (i + 1) * size);
  });
}
var init_chunk = __esm({
  "../../node_modules/.pnpm/@mysten+utils@0.2.0/node_modules/@mysten/utils/dist/esm/chunk.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(chunk, "chunk");
  }
});

// ../../node_modules/.pnpm/@mysten+utils@0.2.0/node_modules/@mysten/utils/dist/esm/dataloader.js
function getCurrentBatch(loader) {
  const existingBatch = loader._batch;
  if (existingBatch !== null && !existingBatch.hasDispatched && existingBatch.keys.length < loader._maxBatchSize) {
    return existingBatch;
  }
  const newBatch = { hasDispatched: false, keys: [], callbacks: [] };
  loader._batch = newBatch;
  loader._batchScheduleFn(() => {
    dispatchBatch(loader, newBatch);
  });
  return newBatch;
}
function dispatchBatch(loader, batch) {
  batch.hasDispatched = true;
  if (batch.keys.length === 0) {
    resolveCacheHits(batch);
    return;
  }
  let batchPromise;
  try {
    batchPromise = loader._batchLoadFn(batch.keys);
  } catch (e) {
    return failedDispatch(
      loader,
      batch,
      new TypeError(
        `DataLoader must be constructed with a function which accepts Array<key> and returns Promise<Array<value>>, but the function errored synchronously: ${String(e)}.`
      )
    );
  }
  if (!batchPromise || typeof batchPromise.then !== "function") {
    return failedDispatch(
      loader,
      batch,
      new TypeError(
        `DataLoader must be constructed with a function which accepts Array<key> and returns Promise<Array<value>>, but the function did not return a Promise: ${String(batchPromise)}.`
      )
    );
  }
  Promise.resolve(batchPromise).then((values) => {
    if (!isArrayLike(values)) {
      throw new TypeError(
        `DataLoader must be constructed with a function which accepts Array<key> and returns Promise<Array<value>>, but the function did not return a Promise of an Array: ${String(values)}.`
      );
    }
    if (values.length !== batch.keys.length) {
      throw new TypeError(
        `DataLoader must be constructed with a function which accepts Array<key> and returns Promise<Array<value>>, but the function did not return a Promise of an Array of the same length as the Array of keys.

Keys:
${String(batch.keys)}

Values:
${String(values)}`
      );
    }
    resolveCacheHits(batch);
    for (let i = 0; i < batch.callbacks.length; i++) {
      const value = values[i];
      if (value instanceof Error) {
        batch.callbacks[i].reject(value);
      } else {
        batch.callbacks[i].resolve(value);
      }
    }
  }).catch((error3) => {
    failedDispatch(loader, batch, error3);
  });
}
function failedDispatch(loader, batch, error3) {
  resolveCacheHits(batch);
  for (let i = 0; i < batch.keys.length; i++) {
    loader.clear(batch.keys[i]);
    batch.callbacks[i].reject(error3);
  }
}
function resolveCacheHits(batch) {
  if (batch.cacheHits) {
    for (let i = 0; i < batch.cacheHits.length; i++) {
      batch.cacheHits[i]();
    }
  }
}
function getValidMaxBatchSize(options) {
  const shouldBatch = !options || options.batch !== false;
  if (!shouldBatch) {
    return 1;
  }
  const maxBatchSize = options && options.maxBatchSize;
  if (maxBatchSize === void 0) {
    return Infinity;
  }
  if (typeof maxBatchSize !== "number" || maxBatchSize < 1) {
    throw new TypeError(`maxBatchSize must be a positive number: ${maxBatchSize}`);
  }
  return maxBatchSize;
}
function getValidBatchScheduleFn(options) {
  const batchScheduleFn = options && options.batchScheduleFn;
  if (batchScheduleFn === void 0) {
    return enqueuePostPromiseJob;
  }
  if (typeof batchScheduleFn !== "function") {
    throw new TypeError(`batchScheduleFn must be a function: ${batchScheduleFn}`);
  }
  return batchScheduleFn;
}
function getValidCacheKeyFn(options) {
  const cacheKeyFn = options && options.cacheKeyFn;
  if (cacheKeyFn === void 0) {
    return (key) => key;
  }
  if (typeof cacheKeyFn !== "function") {
    throw new TypeError(`cacheKeyFn must be a function: ${cacheKeyFn}`);
  }
  return cacheKeyFn;
}
function getValidCacheMap(options) {
  const shouldCache = !options || options.cache !== false;
  if (!shouldCache) {
    return null;
  }
  const cacheMap2 = options && options.cacheMap;
  if (cacheMap2 === void 0) {
    return /* @__PURE__ */ new Map();
  }
  if (cacheMap2 !== null) {
    const cacheFunctions = ["get", "set", "delete", "clear"];
    const missingFunctions = cacheFunctions.filter(
      (fnName) => cacheMap2 && typeof cacheMap2[fnName] !== "function"
    );
    if (missingFunctions.length !== 0) {
      throw new TypeError("Custom cacheMap missing methods: " + missingFunctions.join(", "));
    }
  }
  return cacheMap2;
}
function getValidName(options) {
  if (options && options.name) {
    return options.name;
  }
  return null;
}
function isArrayLike(x) {
  return typeof x === "object" && x !== null && "length" in x && typeof x.length === "number" && (x.length === 0 || x.length > 0 && Object.prototype.hasOwnProperty.call(x, x.length - 1));
}
var DataLoader, enqueuePostPromiseJob, resolvedPromise;
var init_dataloader = __esm({
  "../../node_modules/.pnpm/@mysten+utils@0.2.0/node_modules/@mysten/utils/dist/esm/dataloader.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    DataLoader = class {
      static {
        __name(this, "DataLoader");
      }
      constructor(batchLoadFn, options) {
        if (typeof batchLoadFn !== "function") {
          throw new TypeError(
            `DataLoader must be constructed with a function which accepts Array<key> and returns Promise<Array<value>>, but got: ${batchLoadFn}.`
          );
        }
        this._batchLoadFn = batchLoadFn;
        this._maxBatchSize = getValidMaxBatchSize(options);
        this._batchScheduleFn = getValidBatchScheduleFn(options);
        this._cacheKeyFn = getValidCacheKeyFn(options);
        this._cacheMap = getValidCacheMap(options);
        this._batch = null;
        this.name = getValidName(options);
      }
      /**
       * Loads a key, returning a `Promise` for the value represented by that key.
       */
      load(key) {
        if (key === null || key === void 0) {
          throw new TypeError(
            `The loader.load() function must be called with a value, but got: ${String(key)}.`
          );
        }
        const batch = getCurrentBatch(this);
        const cacheMap2 = this._cacheMap;
        let cacheKey;
        if (cacheMap2) {
          cacheKey = this._cacheKeyFn(key);
          const cachedPromise = cacheMap2.get(cacheKey);
          if (cachedPromise) {
            const cacheHits = batch.cacheHits || (batch.cacheHits = []);
            return new Promise((resolve) => {
              cacheHits.push(() => {
                resolve(cachedPromise);
              });
            });
          }
        }
        batch.keys.push(key);
        const promise = new Promise((resolve, reject) => {
          batch.callbacks.push({ resolve, reject });
        });
        if (cacheMap2) {
          cacheMap2.set(cacheKey, promise);
        }
        return promise;
      }
      /**
       * Loads multiple keys, promising an array of values:
       *
       *     var [ a, b ] = await myLoader.loadMany([ 'a', 'b' ]);
       *
       * This is similar to the more verbose:
       *
       *     var [ a, b ] = await Promise.all([
       *       myLoader.load('a'),
       *       myLoader.load('b')
       *     ]);
       *
       * However it is different in the case where any load fails. Where
       * Promise.all() would reject, loadMany() always resolves, however each result
       * is either a value or an Error instance.
       *
       *     var [ a, b, c ] = await myLoader.loadMany([ 'a', 'b', 'badkey' ]);
       *     // c instanceof Error
       *
       */
      loadMany(keys) {
        if (!isArrayLike(keys)) {
          throw new TypeError(
            `The loader.loadMany() function must be called with Array<key>, but got: ${keys}.`
          );
        }
        const loadPromises = [];
        for (let i = 0; i < keys.length; i++) {
          loadPromises.push(this.load(keys[i]).catch((error3) => error3));
        }
        return Promise.all(loadPromises);
      }
      /**
       * Clears the value at `key` from the cache, if it exists. Returns itself for
       * method chaining.
       */
      clear(key) {
        const cacheMap2 = this._cacheMap;
        if (cacheMap2) {
          const cacheKey = this._cacheKeyFn(key);
          cacheMap2.delete(cacheKey);
        }
        return this;
      }
      /**
       * Clears the entire cache. To be used when some event results in unknown
       * invalidations across this particular `DataLoader`. Returns itself for
       * method chaining.
       */
      clearAll() {
        const cacheMap2 = this._cacheMap;
        if (cacheMap2) {
          cacheMap2.clear();
        }
        return this;
      }
      /**
       * Adds the provided key and value to the cache. If the key already
       * exists, no change is made. Returns itself for method chaining.
       *
       * To prime the cache with an error at a key, provide an Error instance.
       */
      prime(key, value) {
        const cacheMap2 = this._cacheMap;
        if (cacheMap2) {
          const cacheKey = this._cacheKeyFn(key);
          if (cacheMap2.get(cacheKey) === void 0) {
            let promise;
            if (value instanceof Error) {
              promise = Promise.reject(value);
              promise.catch(() => {
              });
            } else {
              promise = Promise.resolve(value);
            }
            cacheMap2.set(cacheKey, promise);
          }
        }
        return this;
      }
    };
    enqueuePostPromiseJob = /** @ts-ignore */
    typeof process === "object" && typeof process.nextTick === "function" ? function(fn) {
      if (!resolvedPromise) {
        resolvedPromise = Promise.resolve();
      }
      resolvedPromise.then(() => {
        process.nextTick(fn);
      });
    } : (
      // @ts-ignore
      typeof setImmediate === "function" ? function(fn) {
        setImmediate(fn);
      } : function(fn) {
        setTimeout(fn);
      }
    );
    __name(getCurrentBatch, "getCurrentBatch");
    __name(dispatchBatch, "dispatchBatch");
    __name(failedDispatch, "failedDispatch");
    __name(resolveCacheHits, "resolveCacheHits");
    __name(getValidMaxBatchSize, "getValidMaxBatchSize");
    __name(getValidBatchScheduleFn, "getValidBatchScheduleFn");
    __name(getValidCacheKeyFn, "getValidCacheKeyFn");
    __name(getValidCacheMap, "getValidCacheMap");
    __name(getValidName, "getValidName");
    __name(isArrayLike, "isArrayLike");
  }
});

// ../../node_modules/.pnpm/@mysten+utils@0.2.0/node_modules/@mysten/utils/dist/esm/index.js
var init_esm2 = __esm({
  "../../node_modules/.pnpm/@mysten+utils@0.2.0/node_modules/@mysten/utils/dist/esm/index.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_b58();
    init_b64();
    init_hex();
    init_chunk();
    init_dataloader();
  }
});

// ../../node_modules/.pnpm/@mysten+bcs@1.9.2/node_modules/@mysten/bcs/dist/esm/uleb.js
function ulebEncode(num) {
  let bigNum = BigInt(num);
  const arr = [];
  let len = 0;
  if (bigNum === 0n) {
    return [0];
  }
  while (bigNum > 0) {
    arr[len] = Number(bigNum & 0x7fn);
    bigNum >>= 7n;
    if (bigNum > 0n) {
      arr[len] |= 128;
    }
    len += 1;
  }
  return arr;
}
function ulebDecode(arr) {
  let total = 0n;
  let shift = 0n;
  let len = 0;
  while (true) {
    if (len >= arr.length) {
      throw new Error("ULEB decode error: buffer overflow");
    }
    const byte = arr[len];
    len += 1;
    total += BigInt(byte & 127) << shift;
    if ((byte & 128) === 0) {
      break;
    }
    shift += 7n;
  }
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("ULEB decode error: value exceeds MAX_SAFE_INTEGER");
  }
  return {
    value: Number(total),
    length: len
  };
}
var init_uleb = __esm({
  "../../node_modules/.pnpm/@mysten+bcs@1.9.2/node_modules/@mysten/bcs/dist/esm/uleb.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(ulebEncode, "ulebEncode");
    __name(ulebDecode, "ulebDecode");
  }
});

// ../../node_modules/.pnpm/@mysten+bcs@1.9.2/node_modules/@mysten/bcs/dist/esm/reader.js
var BcsReader;
var init_reader = __esm({
  "../../node_modules/.pnpm/@mysten+bcs@1.9.2/node_modules/@mysten/bcs/dist/esm/reader.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_uleb();
    BcsReader = class {
      static {
        __name(this, "BcsReader");
      }
      /**
       * @param {Uint8Array} data Data to use as a buffer.
       */
      constructor(data) {
        this.bytePosition = 0;
        this.dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
      }
      /**
       * Shift current cursor position by `bytes`.
       *
       * @param {Number} bytes Number of bytes to
       * @returns {this} Self for possible chaining.
       */
      shift(bytes) {
        this.bytePosition += bytes;
        return this;
      }
      /**
       * Read U8 value from the buffer and shift cursor by 1.
       * @returns
       */
      read8() {
        const value = this.dataView.getUint8(this.bytePosition);
        this.shift(1);
        return value;
      }
      /**
       * Read U16 value from the buffer and shift cursor by 2.
       * @returns
       */
      read16() {
        const value = this.dataView.getUint16(this.bytePosition, true);
        this.shift(2);
        return value;
      }
      /**
       * Read U32 value from the buffer and shift cursor by 4.
       * @returns
       */
      read32() {
        const value = this.dataView.getUint32(this.bytePosition, true);
        this.shift(4);
        return value;
      }
      /**
       * Read U64 value from the buffer and shift cursor by 8.
       * @returns
       */
      read64() {
        const value1 = this.read32();
        const value2 = this.read32();
        const result = value2.toString(16) + value1.toString(16).padStart(8, "0");
        return BigInt("0x" + result).toString(10);
      }
      /**
       * Read U128 value from the buffer and shift cursor by 16.
       */
      read128() {
        const value1 = BigInt(this.read64());
        const value2 = BigInt(this.read64());
        const result = value2.toString(16) + value1.toString(16).padStart(16, "0");
        return BigInt("0x" + result).toString(10);
      }
      /**
       * Read U128 value from the buffer and shift cursor by 32.
       * @returns
       */
      read256() {
        const value1 = BigInt(this.read128());
        const value2 = BigInt(this.read128());
        const result = value2.toString(16) + value1.toString(16).padStart(32, "0");
        return BigInt("0x" + result).toString(10);
      }
      /**
       * Read `num` number of bytes from the buffer and shift cursor by `num`.
       * @param num Number of bytes to read.
       */
      readBytes(num) {
        const start = this.bytePosition + this.dataView.byteOffset;
        const value = new Uint8Array(this.dataView.buffer, start, num);
        this.shift(num);
        return value;
      }
      /**
       * Read ULEB value - an integer of varying size. Used for enum indexes and
       * vector lengths.
       * @returns {Number} The ULEB value.
       */
      readULEB() {
        const start = this.bytePosition + this.dataView.byteOffset;
        const buffer = new Uint8Array(this.dataView.buffer, start);
        const { value, length } = ulebDecode(buffer);
        this.shift(length);
        return value;
      }
      /**
       * Read a BCS vector: read a length and then apply function `cb` X times
       * where X is the length of the vector, defined as ULEB in BCS bytes.
       * @param cb Callback to process elements of vector.
       * @returns {Array<Any>} Array of the resulting values, returned by callback.
       */
      readVec(cb) {
        const length = this.readULEB();
        const result = [];
        for (let i = 0; i < length; i++) {
          result.push(cb(this, i, length));
        }
        return result;
      }
    };
  }
});

// ../../node_modules/.pnpm/@mysten+bcs@1.9.2/node_modules/@mysten/bcs/dist/esm/utils.js
function encodeStr(data, encoding) {
  switch (encoding) {
    case "base58":
      return toBase58(data);
    case "base64":
      return toBase64(data);
    case "hex":
      return toHex(data);
    default:
      throw new Error("Unsupported encoding, supported values are: base64, hex");
  }
}
function splitGenericParameters(str, genericSeparators = ["<", ">"]) {
  const [left, right] = genericSeparators;
  const tok = [];
  let word = "";
  let nestedAngleBrackets = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === left) {
      nestedAngleBrackets++;
    }
    if (char === right) {
      nestedAngleBrackets--;
    }
    if (nestedAngleBrackets === 0 && char === ",") {
      tok.push(word.trim());
      word = "";
      continue;
    }
    word += char;
  }
  tok.push(word.trim());
  return tok;
}
var init_utils2 = __esm({
  "../../node_modules/.pnpm/@mysten+bcs@1.9.2/node_modules/@mysten/bcs/dist/esm/utils.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm2();
    __name(encodeStr, "encodeStr");
    __name(splitGenericParameters, "splitGenericParameters");
  }
});

// ../../node_modules/.pnpm/@mysten+bcs@1.9.2/node_modules/@mysten/bcs/dist/esm/writer.js
function toLittleEndian(bigint3, size) {
  const result = new Uint8Array(size);
  let i = 0;
  while (bigint3 > 0) {
    result[i] = Number(bigint3 % BigInt(256));
    bigint3 = bigint3 / BigInt(256);
    i += 1;
  }
  return result;
}
var BcsWriter;
var init_writer = __esm({
  "../../node_modules/.pnpm/@mysten+bcs@1.9.2/node_modules/@mysten/bcs/dist/esm/writer.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_uleb();
    init_utils2();
    BcsWriter = class {
      static {
        __name(this, "BcsWriter");
      }
      constructor({
        initialSize = 1024,
        maxSize = Infinity,
        allocateSize = 1024
      } = {}) {
        this.bytePosition = 0;
        this.size = initialSize;
        this.maxSize = maxSize;
        this.allocateSize = allocateSize;
        this.dataView = new DataView(new ArrayBuffer(initialSize));
      }
      ensureSizeOrGrow(bytes) {
        const requiredSize = this.bytePosition + bytes;
        if (requiredSize > this.size) {
          const nextSize = Math.min(
            this.maxSize,
            Math.max(this.size + requiredSize, this.size + this.allocateSize)
          );
          if (requiredSize > nextSize) {
            throw new Error(
              `Attempting to serialize to BCS, but buffer does not have enough size. Allocated size: ${this.size}, Max size: ${this.maxSize}, Required size: ${requiredSize}`
            );
          }
          this.size = nextSize;
          const nextBuffer = new ArrayBuffer(this.size);
          new Uint8Array(nextBuffer).set(new Uint8Array(this.dataView.buffer));
          this.dataView = new DataView(nextBuffer);
        }
      }
      /**
       * Shift current cursor position by `bytes`.
       *
       * @param {Number} bytes Number of bytes to
       * @returns {this} Self for possible chaining.
       */
      shift(bytes) {
        this.bytePosition += bytes;
        return this;
      }
      /**
       * Write a U8 value into a buffer and shift cursor position by 1.
       * @param {Number} value Value to write.
       * @returns {this}
       */
      write8(value) {
        this.ensureSizeOrGrow(1);
        this.dataView.setUint8(this.bytePosition, Number(value));
        return this.shift(1);
      }
      /**
       * Write a U8 value into a buffer and shift cursor position by 1.
       * @param {Number} value Value to write.
       * @returns {this}
       */
      writeBytes(bytes) {
        this.ensureSizeOrGrow(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
          this.dataView.setUint8(this.bytePosition + i, bytes[i]);
        }
        return this.shift(bytes.length);
      }
      /**
       * Write a U16 value into a buffer and shift cursor position by 2.
       * @param {Number} value Value to write.
       * @returns {this}
       */
      write16(value) {
        this.ensureSizeOrGrow(2);
        this.dataView.setUint16(this.bytePosition, Number(value), true);
        return this.shift(2);
      }
      /**
       * Write a U32 value into a buffer and shift cursor position by 4.
       * @param {Number} value Value to write.
       * @returns {this}
       */
      write32(value) {
        this.ensureSizeOrGrow(4);
        this.dataView.setUint32(this.bytePosition, Number(value), true);
        return this.shift(4);
      }
      /**
       * Write a U64 value into a buffer and shift cursor position by 8.
       * @param {bigint} value Value to write.
       * @returns {this}
       */
      write64(value) {
        toLittleEndian(BigInt(value), 8).forEach((el) => this.write8(el));
        return this;
      }
      /**
       * Write a U128 value into a buffer and shift cursor position by 16.
       *
       * @param {bigint} value Value to write.
       * @returns {this}
       */
      write128(value) {
        toLittleEndian(BigInt(value), 16).forEach((el) => this.write8(el));
        return this;
      }
      /**
       * Write a U256 value into a buffer and shift cursor position by 16.
       *
       * @param {bigint} value Value to write.
       * @returns {this}
       */
      write256(value) {
        toLittleEndian(BigInt(value), 32).forEach((el) => this.write8(el));
        return this;
      }
      /**
       * Write a ULEB value into a buffer and shift cursor position by number of bytes
       * written.
       * @param {Number} value Value to write.
       * @returns {this}
       */
      writeULEB(value) {
        ulebEncode(value).forEach((el) => this.write8(el));
        return this;
      }
      /**
       * Write a vector into a buffer by first writing the vector length and then calling
       * a callback on each passed value.
       *
       * @param {Array<Any>} vector Array of elements to write.
       * @param {WriteVecCb} cb Callback to call on each element of the vector.
       * @returns {this}
       */
      writeVec(vector2, cb) {
        this.writeULEB(vector2.length);
        Array.from(vector2).forEach((el, i) => cb(this, el, i, vector2.length));
        return this;
      }
      /**
       * Adds support for iterations over the object.
       * @returns {Uint8Array}
       */
      // oxlint-disable-next-line require-yields
      *[Symbol.iterator]() {
        for (let i = 0; i < this.bytePosition; i++) {
          yield this.dataView.getUint8(i);
        }
        return this.toBytes();
      }
      /**
       * Get underlying buffer taking only value bytes (in case initial buffer size was bigger).
       * @returns {Uint8Array} Resulting bcs.
       */
      toBytes() {
        return new Uint8Array(this.dataView.buffer.slice(0, this.bytePosition));
      }
      /**
       * Represent data as 'hex' or 'base64'
       * @param encoding Encoding to use: 'base64' or 'hex'
       */
      toString(encoding) {
        return encodeStr(this.toBytes(), encoding);
      }
    };
    __name(toLittleEndian, "toLittleEndian");
  }
});

// ../../node_modules/.pnpm/@mysten+bcs@1.9.2/node_modules/@mysten/bcs/dist/esm/bcs-type.js
function isSerializedBcs(obj) {
  return !!obj && typeof obj === "object" && obj[SERIALIZED_BCS_BRAND] === true;
}
function fixedSizeBcsType({
  size,
  ...options
}) {
  return new BcsType({
    ...options,
    serializedSize: /* @__PURE__ */ __name(() => size, "serializedSize")
  });
}
function uIntBcsType({
  readMethod,
  writeMethod,
  ...options
}) {
  return fixedSizeBcsType({
    ...options,
    read: /* @__PURE__ */ __name((reader) => reader[readMethod](), "read"),
    write: /* @__PURE__ */ __name((value, writer) => writer[writeMethod](value), "write"),
    validate: /* @__PURE__ */ __name((value) => {
      if (value < 0 || value > options.maxValue) {
        throw new TypeError(
          `Invalid ${options.name} value: ${value}. Expected value in range 0-${options.maxValue}`
        );
      }
      options.validate?.(value);
    }, "validate")
  });
}
function bigUIntBcsType({
  readMethod,
  writeMethod,
  ...options
}) {
  return fixedSizeBcsType({
    ...options,
    read: /* @__PURE__ */ __name((reader) => reader[readMethod](), "read"),
    write: /* @__PURE__ */ __name((value, writer) => writer[writeMethod](BigInt(value)), "write"),
    validate: /* @__PURE__ */ __name((val) => {
      const value = BigInt(val);
      if (value < 0 || value > options.maxValue) {
        throw new TypeError(
          `Invalid ${options.name} value: ${value}. Expected value in range 0-${options.maxValue}`
        );
      }
      options.validate?.(value);
    }, "validate")
  });
}
function dynamicSizeBcsType({
  serialize,
  ...options
}) {
  const type = new BcsType({
    ...options,
    serialize,
    write: /* @__PURE__ */ __name((value, writer) => {
      for (const byte of type.serialize(value).toBytes()) {
        writer.write8(byte);
      }
    }, "write")
  });
  return type;
}
function stringLikeBcsType({
  toBytes: toBytes2,
  fromBytes,
  ...options
}) {
  return new BcsType({
    ...options,
    read: /* @__PURE__ */ __name((reader) => {
      const length = reader.readULEB();
      const bytes = reader.readBytes(length);
      return fromBytes(bytes);
    }, "read"),
    write: /* @__PURE__ */ __name((hex, writer) => {
      const bytes = toBytes2(hex);
      writer.writeULEB(bytes.length);
      for (let i = 0; i < bytes.length; i++) {
        writer.write8(bytes[i]);
      }
    }, "write"),
    serialize: /* @__PURE__ */ __name((value) => {
      const bytes = toBytes2(value);
      const size = ulebEncode(bytes.length);
      const result = new Uint8Array(size.length + bytes.length);
      result.set(size, 0);
      result.set(bytes, size.length);
      return result;
    }, "serialize"),
    validate: /* @__PURE__ */ __name((value) => {
      if (typeof value !== "string") {
        throw new TypeError(`Invalid ${options.name} value: ${value}. Expected string`);
      }
      options.validate?.(value);
    }, "validate")
  });
}
function lazyBcsType(cb) {
  let lazyType = null;
  function getType() {
    if (!lazyType) {
      lazyType = cb();
    }
    return lazyType;
  }
  __name(getType, "getType");
  return new BcsType({
    name: "lazy",
    read: /* @__PURE__ */ __name((data) => getType().read(data), "read"),
    serializedSize: /* @__PURE__ */ __name((value) => getType().serializedSize(value), "serializedSize"),
    write: /* @__PURE__ */ __name((value, writer) => getType().write(value, writer), "write"),
    serialize: /* @__PURE__ */ __name((value, options) => getType().serialize(value, options).toBytes(), "serialize")
  });
}
var __typeError3, __accessCheck3, __privateGet3, __privateAdd3, __privateSet3, _write, _serialize, _schema, _bytes, _BcsType, BcsType, SERIALIZED_BCS_BRAND, SerializedBcs, BcsStruct, BcsEnum, BcsTuple;
var init_bcs_type = __esm({
  "../../node_modules/.pnpm/@mysten+bcs@1.9.2/node_modules/@mysten/bcs/dist/esm/bcs-type.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm2();
    init_reader();
    init_uleb();
    init_writer();
    __typeError3 = /* @__PURE__ */ __name((msg) => {
      throw TypeError(msg);
    }, "__typeError");
    __accessCheck3 = /* @__PURE__ */ __name((obj, member, msg) => member.has(obj) || __typeError3("Cannot " + msg), "__accessCheck");
    __privateGet3 = /* @__PURE__ */ __name((obj, member, getter) => (__accessCheck3(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj)), "__privateGet");
    __privateAdd3 = /* @__PURE__ */ __name((obj, member, value) => member.has(obj) ? __typeError3("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value), "__privateAdd");
    __privateSet3 = /* @__PURE__ */ __name((obj, member, value, setter) => (__accessCheck3(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value), "__privateSet");
    _BcsType = class _BcsType2 {
      static {
        __name(this, "_BcsType");
      }
      constructor(options) {
        __privateAdd3(this, _write);
        __privateAdd3(this, _serialize);
        this.name = options.name;
        this.read = options.read;
        this.serializedSize = options.serializedSize ?? (() => null);
        __privateSet3(this, _write, options.write);
        __privateSet3(this, _serialize, options.serialize ?? ((value, options2) => {
          const writer = new BcsWriter({
            initialSize: this.serializedSize(value) ?? void 0,
            ...options2
          });
          __privateGet3(this, _write).call(this, value, writer);
          return writer.toBytes();
        }));
        this.validate = options.validate ?? (() => {
        });
      }
      write(value, writer) {
        this.validate(value);
        __privateGet3(this, _write).call(this, value, writer);
      }
      serialize(value, options) {
        this.validate(value);
        return new SerializedBcs(this, __privateGet3(this, _serialize).call(this, value, options));
      }
      parse(bytes) {
        const reader = new BcsReader(bytes);
        return this.read(reader);
      }
      fromHex(hex) {
        return this.parse(fromHex(hex));
      }
      fromBase58(b64) {
        return this.parse(fromBase58(b64));
      }
      fromBase64(b64) {
        return this.parse(fromBase64(b64));
      }
      transform({
        name,
        input,
        output,
        validate: validate2
      }) {
        return new _BcsType2({
          name: name ?? this.name,
          read: /* @__PURE__ */ __name((reader) => output ? output(this.read(reader)) : this.read(reader), "read"),
          write: /* @__PURE__ */ __name((value, writer) => __privateGet3(this, _write).call(this, input ? input(value) : value, writer), "write"),
          serializedSize: /* @__PURE__ */ __name((value) => this.serializedSize(input ? input(value) : value), "serializedSize"),
          serialize: /* @__PURE__ */ __name((value, options) => __privateGet3(this, _serialize).call(this, input ? input(value) : value, options), "serialize"),
          validate: /* @__PURE__ */ __name((value) => {
            validate2?.(value);
            this.validate(input ? input(value) : value);
          }, "validate")
        });
      }
    };
    _write = /* @__PURE__ */ new WeakMap();
    _serialize = /* @__PURE__ */ new WeakMap();
    BcsType = _BcsType;
    SERIALIZED_BCS_BRAND = /* @__PURE__ */ Symbol.for("@mysten/serialized-bcs");
    __name(isSerializedBcs, "isSerializedBcs");
    SerializedBcs = class {
      static {
        __name(this, "SerializedBcs");
      }
      constructor(schema, bytes) {
        __privateAdd3(this, _schema);
        __privateAdd3(this, _bytes);
        __privateSet3(this, _schema, schema);
        __privateSet3(this, _bytes, bytes);
      }
      // Used to brand SerializedBcs so that they can be identified, even between multiple copies
      // of the @mysten/bcs package are installed
      get [SERIALIZED_BCS_BRAND]() {
        return true;
      }
      toBytes() {
        return __privateGet3(this, _bytes);
      }
      toHex() {
        return toHex(__privateGet3(this, _bytes));
      }
      toBase64() {
        return toBase64(__privateGet3(this, _bytes));
      }
      toBase58() {
        return toBase58(__privateGet3(this, _bytes));
      }
      parse() {
        return __privateGet3(this, _schema).parse(__privateGet3(this, _bytes));
      }
    };
    _schema = /* @__PURE__ */ new WeakMap();
    _bytes = /* @__PURE__ */ new WeakMap();
    __name(fixedSizeBcsType, "fixedSizeBcsType");
    __name(uIntBcsType, "uIntBcsType");
    __name(bigUIntBcsType, "bigUIntBcsType");
    __name(dynamicSizeBcsType, "dynamicSizeBcsType");
    __name(stringLikeBcsType, "stringLikeBcsType");
    __name(lazyBcsType, "lazyBcsType");
    BcsStruct = class extends BcsType {
      static {
        __name(this, "BcsStruct");
      }
      constructor({ name, fields, ...options }) {
        const canonicalOrder = Object.entries(fields);
        super({
          name,
          serializedSize: /* @__PURE__ */ __name((values) => {
            let total = 0;
            for (const [field, type] of canonicalOrder) {
              const size = type.serializedSize(values[field]);
              if (size == null) {
                return null;
              }
              total += size;
            }
            return total;
          }, "serializedSize"),
          read: /* @__PURE__ */ __name((reader) => {
            const result = {};
            for (const [field, type] of canonicalOrder) {
              result[field] = type.read(reader);
            }
            return result;
          }, "read"),
          write: /* @__PURE__ */ __name((value, writer) => {
            for (const [field, type] of canonicalOrder) {
              type.write(value[field], writer);
            }
          }, "write"),
          ...options,
          validate: /* @__PURE__ */ __name((value) => {
            options?.validate?.(value);
            if (typeof value !== "object" || value == null) {
              throw new TypeError(`Expected object, found ${typeof value}`);
            }
          }, "validate")
        });
      }
    };
    BcsEnum = class extends BcsType {
      static {
        __name(this, "BcsEnum");
      }
      constructor({ fields, ...options }) {
        const canonicalOrder = Object.entries(fields);
        super({
          read: /* @__PURE__ */ __name((reader) => {
            const index = reader.readULEB();
            const enumEntry = canonicalOrder[index];
            if (!enumEntry) {
              throw new TypeError(`Unknown value ${index} for enum ${options.name}`);
            }
            const [kind, type] = enumEntry;
            return {
              [kind]: type?.read(reader) ?? true,
              $kind: kind
            };
          }, "read"),
          write: /* @__PURE__ */ __name((value, writer) => {
            const [name, val] = Object.entries(value).filter(
              ([name2]) => Object.hasOwn(fields, name2)
            )[0];
            for (let i = 0; i < canonicalOrder.length; i++) {
              const [optionName, optionType] = canonicalOrder[i];
              if (optionName === name) {
                writer.writeULEB(i);
                optionType?.write(val, writer);
                return;
              }
            }
          }, "write"),
          ...options,
          validate: /* @__PURE__ */ __name((value) => {
            options?.validate?.(value);
            if (typeof value !== "object" || value == null) {
              throw new TypeError(`Expected object, found ${typeof value}`);
            }
            const keys = Object.keys(value).filter(
              (k) => value[k] !== void 0 && Object.hasOwn(fields, k)
            );
            if (keys.length !== 1) {
              throw new TypeError(
                `Expected object with one key, but found ${keys.length} for type ${options.name}}`
              );
            }
            const [variant] = keys;
            if (!Object.hasOwn(fields, variant)) {
              throw new TypeError(`Invalid enum variant ${variant}`);
            }
          }, "validate")
        });
      }
    };
    BcsTuple = class extends BcsType {
      static {
        __name(this, "BcsTuple");
      }
      constructor({ fields, name, ...options }) {
        super({
          name: name ?? `(${fields.map((t) => t.name).join(", ")})`,
          serializedSize: /* @__PURE__ */ __name((values) => {
            let total = 0;
            for (let i = 0; i < fields.length; i++) {
              const size = fields[i].serializedSize(values[i]);
              if (size == null) {
                return null;
              }
              total += size;
            }
            return total;
          }, "serializedSize"),
          read: /* @__PURE__ */ __name((reader) => {
            const result = [];
            for (const field of fields) {
              result.push(field.read(reader));
            }
            return result;
          }, "read"),
          write: /* @__PURE__ */ __name((value, writer) => {
            for (let i = 0; i < fields.length; i++) {
              fields[i].write(value[i], writer);
            }
          }, "write"),
          ...options,
          validate: /* @__PURE__ */ __name((value) => {
            options?.validate?.(value);
            if (!Array.isArray(value)) {
              throw new TypeError(`Expected array, found ${typeof value}`);
            }
            if (value.length !== fields.length) {
              throw new TypeError(`Expected array of length ${fields.length}, found ${value.length}`);
            }
          }, "validate")
        });
      }
    };
  }
});

// ../../node_modules/.pnpm/@mysten+bcs@1.9.2/node_modules/@mysten/bcs/dist/esm/bcs.js
function fixedArray(size, type, options) {
  return new BcsType({
    read: /* @__PURE__ */ __name((reader) => {
      const result = new Array(size);
      for (let i = 0; i < size; i++) {
        result[i] = type.read(reader);
      }
      return result;
    }, "read"),
    write: /* @__PURE__ */ __name((value, writer) => {
      for (const item of value) {
        type.write(item, writer);
      }
    }, "write"),
    ...options,
    name: options?.name ?? `${type.name}[${size}]`,
    validate: /* @__PURE__ */ __name((value) => {
      options?.validate?.(value);
      if (!value || typeof value !== "object" || !("length" in value)) {
        throw new TypeError(`Expected array, found ${typeof value}`);
      }
      if (value.length !== size) {
        throw new TypeError(`Expected array of length ${size}, found ${value.length}`);
      }
    }, "validate")
  });
}
function option(type) {
  return bcs.enum(`Option<${type.name}>`, {
    None: null,
    Some: type
  }).transform({
    input: /* @__PURE__ */ __name((value) => {
      if (value == null) {
        return { None: true };
      }
      return { Some: value };
    }, "input"),
    output: /* @__PURE__ */ __name((value) => {
      if (value.$kind === "Some") {
        return value.Some;
      }
      return null;
    }, "output")
  });
}
function vector(type, options) {
  return new BcsType({
    read: /* @__PURE__ */ __name((reader) => {
      const length = reader.readULEB();
      const result = new Array(length);
      for (let i = 0; i < length; i++) {
        result[i] = type.read(reader);
      }
      return result;
    }, "read"),
    write: /* @__PURE__ */ __name((value, writer) => {
      writer.writeULEB(value.length);
      for (const item of value) {
        type.write(item, writer);
      }
    }, "write"),
    ...options,
    name: options?.name ?? `vector<${type.name}>`,
    validate: /* @__PURE__ */ __name((value) => {
      options?.validate?.(value);
      if (!value || typeof value !== "object" || !("length" in value)) {
        throw new TypeError(`Expected array, found ${typeof value}`);
      }
    }, "validate")
  });
}
function map(keyType, valueType) {
  return bcs.vector(bcs.tuple([keyType, valueType])).transform({
    name: `Map<${keyType.name}, ${valueType.name}>`,
    input: /* @__PURE__ */ __name((value) => {
      return [...value.entries()];
    }, "input"),
    output: /* @__PURE__ */ __name((value) => {
      const result = /* @__PURE__ */ new Map();
      for (const [key, val] of value) {
        result.set(key, val);
      }
      return result;
    }, "output")
  });
}
var bcs;
var init_bcs = __esm({
  "../../node_modules/.pnpm/@mysten+bcs@1.9.2/node_modules/@mysten/bcs/dist/esm/bcs.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_bcs_type();
    init_uleb();
    __name(fixedArray, "fixedArray");
    __name(option, "option");
    __name(vector, "vector");
    __name(map, "map");
    bcs = {
      /**
       * Creates a BcsType that can be used to read and write an 8-bit unsigned integer.
       * @example
       * bcs.u8().serialize(255).toBytes() // Uint8Array [ 255 ]
       */
      u8(options) {
        return uIntBcsType({
          readMethod: "read8",
          writeMethod: "write8",
          size: 1,
          maxValue: 2 ** 8 - 1,
          ...options,
          name: options?.name ?? "u8"
        });
      },
      /**
       * Creates a BcsType that can be used to read and write a 16-bit unsigned integer.
       * @example
       * bcs.u16().serialize(65535).toBytes() // Uint8Array [ 255, 255 ]
       */
      u16(options) {
        return uIntBcsType({
          readMethod: "read16",
          writeMethod: "write16",
          size: 2,
          maxValue: 2 ** 16 - 1,
          ...options,
          name: options?.name ?? "u16"
        });
      },
      /**
       * Creates a BcsType that can be used to read and write a 32-bit unsigned integer.
       * @example
       * bcs.u32().serialize(4294967295).toBytes() // Uint8Array [ 255, 255, 255, 255 ]
       */
      u32(options) {
        return uIntBcsType({
          readMethod: "read32",
          writeMethod: "write32",
          size: 4,
          maxValue: 2 ** 32 - 1,
          ...options,
          name: options?.name ?? "u32"
        });
      },
      /**
       * Creates a BcsType that can be used to read and write a 64-bit unsigned integer.
       * @example
       * bcs.u64().serialize(1).toBytes() // Uint8Array [ 1, 0, 0, 0, 0, 0, 0, 0 ]
       */
      u64(options) {
        return bigUIntBcsType({
          readMethod: "read64",
          writeMethod: "write64",
          size: 8,
          maxValue: 2n ** 64n - 1n,
          ...options,
          name: options?.name ?? "u64"
        });
      },
      /**
       * Creates a BcsType that can be used to read and write a 128-bit unsigned integer.
       * @example
       * bcs.u128().serialize(1).toBytes() // Uint8Array [ 1, ..., 0 ]
       */
      u128(options) {
        return bigUIntBcsType({
          readMethod: "read128",
          writeMethod: "write128",
          size: 16,
          maxValue: 2n ** 128n - 1n,
          ...options,
          name: options?.name ?? "u128"
        });
      },
      /**
       * Creates a BcsType that can be used to read and write a 256-bit unsigned integer.
       * @example
       * bcs.u256().serialize(1).toBytes() // Uint8Array [ 1, ..., 0 ]
       */
      u256(options) {
        return bigUIntBcsType({
          readMethod: "read256",
          writeMethod: "write256",
          size: 32,
          maxValue: 2n ** 256n - 1n,
          ...options,
          name: options?.name ?? "u256"
        });
      },
      /**
       * Creates a BcsType that can be used to read and write boolean values.
       * @example
       * bcs.bool().serialize(true).toBytes() // Uint8Array [ 1 ]
       */
      bool(options) {
        return fixedSizeBcsType({
          size: 1,
          read: /* @__PURE__ */ __name((reader) => reader.read8() === 1, "read"),
          write: /* @__PURE__ */ __name((value, writer) => writer.write8(value ? 1 : 0), "write"),
          ...options,
          name: options?.name ?? "bool",
          validate: /* @__PURE__ */ __name((value) => {
            options?.validate?.(value);
            if (typeof value !== "boolean") {
              throw new TypeError(`Expected boolean, found ${typeof value}`);
            }
          }, "validate")
        });
      },
      /**
       * Creates a BcsType that can be used to read and write unsigned LEB encoded integers
       * @example
       *
       */
      uleb128(options) {
        return dynamicSizeBcsType({
          read: /* @__PURE__ */ __name((reader) => reader.readULEB(), "read"),
          serialize: /* @__PURE__ */ __name((value) => {
            return Uint8Array.from(ulebEncode(value));
          }, "serialize"),
          ...options,
          name: options?.name ?? "uleb128"
        });
      },
      /**
       * Creates a BcsType representing a fixed length byte array
       * @param size The number of bytes this types represents
       * @example
       * bcs.bytes(3).serialize(new Uint8Array([1, 2, 3])).toBytes() // Uint8Array [1, 2, 3]
       */
      bytes(size, options) {
        return fixedSizeBcsType({
          size,
          read: /* @__PURE__ */ __name((reader) => reader.readBytes(size), "read"),
          write: /* @__PURE__ */ __name((value, writer) => {
            writer.writeBytes(new Uint8Array(value));
          }, "write"),
          ...options,
          name: options?.name ?? `bytes[${size}]`,
          validate: /* @__PURE__ */ __name((value) => {
            options?.validate?.(value);
            if (!value || typeof value !== "object" || !("length" in value)) {
              throw new TypeError(`Expected array, found ${typeof value}`);
            }
            if (value.length !== size) {
              throw new TypeError(`Expected array of length ${size}, found ${value.length}`);
            }
          }, "validate")
        });
      },
      /**
       * Creates a BcsType representing a variable length byte array
       *
       * @example
       * bcs.byteVector().serialize([1, 2, 3]).toBytes() // Uint8Array [3, 1, 2, 3]
       */
      byteVector(options) {
        return new BcsType({
          read: /* @__PURE__ */ __name((reader) => {
            const length = reader.readULEB();
            return reader.readBytes(length);
          }, "read"),
          write: /* @__PURE__ */ __name((value, writer) => {
            const array2 = new Uint8Array(value);
            writer.writeULEB(array2.length);
            writer.writeBytes(array2);
          }, "write"),
          ...options,
          name: options?.name ?? "vector<u8>",
          serializedSize: /* @__PURE__ */ __name((value) => {
            const length = "length" in value ? value.length : null;
            return length == null ? null : ulebEncode(length).length + length;
          }, "serializedSize"),
          validate: /* @__PURE__ */ __name((value) => {
            options?.validate?.(value);
            if (!value || typeof value !== "object" || !("length" in value)) {
              throw new TypeError(`Expected array, found ${typeof value}`);
            }
          }, "validate")
        });
      },
      /**
       * Creates a BcsType that can ser/de string values.  Strings will be UTF-8 encoded
       * @example
       * bcs.string().serialize('a').toBytes() // Uint8Array [ 1, 97 ]
       */
      string(options) {
        return stringLikeBcsType({
          toBytes: /* @__PURE__ */ __name((value) => new TextEncoder().encode(value), "toBytes"),
          fromBytes: /* @__PURE__ */ __name((bytes) => new TextDecoder().decode(bytes), "fromBytes"),
          ...options,
          name: options?.name ?? "string"
        });
      },
      /**
       * Creates a BcsType that represents a fixed length array of a given type
       * @param size The number of elements in the array
       * @param type The BcsType of each element in the array
       * @example
       * bcs.fixedArray(3, bcs.u8()).serialize([1, 2, 3]).toBytes() // Uint8Array [ 1, 2, 3 ]
       */
      fixedArray,
      /**
       * Creates a BcsType representing an optional value
       * @param type The BcsType of the optional value
       * @example
       * bcs.option(bcs.u8()).serialize(null).toBytes() // Uint8Array [ 0 ]
       * bcs.option(bcs.u8()).serialize(1).toBytes() // Uint8Array [ 1, 1 ]
       */
      option,
      /**
       * Creates a BcsType representing a variable length vector of a given type
       * @param type The BcsType of each element in the vector
       *
       * @example
       * bcs.vector(bcs.u8()).toBytes([1, 2, 3]) // Uint8Array [ 3, 1, 2, 3 ]
       */
      vector,
      /**
       * Creates a BcsType representing a tuple of a given set of types
       * @param types The BcsTypes for each element in the tuple
       *
       * @example
       * const tuple = bcs.tuple([bcs.u8(), bcs.string(), bcs.bool()])
       * tuple.serialize([1, 'a', true]).toBytes() // Uint8Array [ 1, 1, 97, 1 ]
       */
      tuple(fields, options) {
        return new BcsTuple({
          fields,
          ...options
        });
      },
      /**
       * Creates a BcsType representing a struct of a given set of fields
       * @param name The name of the struct
       * @param fields The fields of the struct. The order of the fields affects how data is serialized and deserialized
       *
       * @example
       * const struct = bcs.struct('MyStruct', {
       *  a: bcs.u8(),
       *  b: bcs.string(),
       * })
       * struct.serialize({ a: 1, b: 'a' }).toBytes() // Uint8Array [ 1, 1, 97 ]
       */
      struct(name, fields, options) {
        return new BcsStruct({
          name,
          fields,
          ...options
        });
      },
      /**
       * Creates a BcsType representing an enum of a given set of options
       * @param name The name of the enum
       * @param values The values of the enum. The order of the values affects how data is serialized and deserialized.
       * null can be used to represent a variant with no data.
       *
       * @example
       * const enum = bcs.enum('MyEnum', {
       *   A: bcs.u8(),
       *   B: bcs.string(),
       *   C: null,
       * })
       * enum.serialize({ A: 1 }).toBytes() // Uint8Array [ 0, 1 ]
       * enum.serialize({ B: 'a' }).toBytes() // Uint8Array [ 1, 1, 97 ]
       * enum.serialize({ C: true }).toBytes() // Uint8Array [ 2 ]
       */
      enum(name, fields, options) {
        return new BcsEnum({
          name,
          fields,
          ...options
        });
      },
      /**
       * Creates a BcsType representing a map of a given key and value type
       * @param keyType The BcsType of the key
       * @param valueType The BcsType of the value
       * @example
       * const map = bcs.map(bcs.u8(), bcs.string())
       * map.serialize(new Map([[2, 'a']])).toBytes() // Uint8Array [ 1, 2, 1, 97 ]
       */
      map,
      /**
       * Creates a BcsType that wraps another BcsType which is lazily evaluated. This is useful for creating recursive types.
       * @param cb A callback that returns the BcsType
       */
      lazy(cb) {
        return lazyBcsType(cb);
      }
    };
  }
});

// ../../node_modules/.pnpm/@mysten+bcs@1.9.2/node_modules/@mysten/bcs/dist/esm/index.js
var init_esm3 = __esm({
  "../../node_modules/.pnpm/@mysten+bcs@1.9.2/node_modules/@mysten/bcs/dist/esm/index.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm2();
    init_bcs_type();
    init_bcs();
    init_utils2();
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/experimental/cache.js
var __typeError4, __accessCheck4, __privateGet4, __privateAdd4, __privateSet4, _prefix, _cache, _ClientCache, ClientCache;
var init_cache = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/experimental/cache.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __typeError4 = /* @__PURE__ */ __name((msg) => {
      throw TypeError(msg);
    }, "__typeError");
    __accessCheck4 = /* @__PURE__ */ __name((obj, member, msg) => member.has(obj) || __typeError4("Cannot " + msg), "__accessCheck");
    __privateGet4 = /* @__PURE__ */ __name((obj, member, getter) => (__accessCheck4(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj)), "__privateGet");
    __privateAdd4 = /* @__PURE__ */ __name((obj, member, value) => member.has(obj) ? __typeError4("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value), "__privateAdd");
    __privateSet4 = /* @__PURE__ */ __name((obj, member, value, setter) => (__accessCheck4(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value), "__privateSet");
    _ClientCache = class _ClientCache2 {
      static {
        __name(this, "_ClientCache");
      }
      constructor({ prefix, cache } = {}) {
        __privateAdd4(this, _prefix);
        __privateAdd4(this, _cache);
        __privateSet4(this, _prefix, prefix ?? []);
        __privateSet4(this, _cache, cache ?? /* @__PURE__ */ new Map());
      }
      read(key, load) {
        const cacheKey = [__privateGet4(this, _prefix), ...key].join(":");
        if (__privateGet4(this, _cache).has(cacheKey)) {
          return __privateGet4(this, _cache).get(cacheKey);
        }
        const result = load();
        __privateGet4(this, _cache).set(cacheKey, result);
        if (typeof result === "object" && result !== null && "then" in result) {
          return Promise.resolve(result).then((v) => {
            __privateGet4(this, _cache).set(cacheKey, v);
            return v;
          }).catch((err) => {
            __privateGet4(this, _cache).delete(cacheKey);
            throw err;
          });
        }
        return result;
      }
      readSync(key, load) {
        const cacheKey = [__privateGet4(this, _prefix), ...key].join(":");
        if (__privateGet4(this, _cache).has(cacheKey)) {
          return __privateGet4(this, _cache).get(cacheKey);
        }
        const result = load();
        __privateGet4(this, _cache).set(cacheKey, result);
        return result;
      }
      clear(prefix) {
        const prefixKey = [...__privateGet4(this, _prefix), ...prefix ?? []].join(":");
        if (!prefixKey) {
          __privateGet4(this, _cache).clear();
          return;
        }
        for (const key of __privateGet4(this, _cache).keys()) {
          if (key.startsWith(prefixKey)) {
            __privateGet4(this, _cache).delete(key);
          }
        }
      }
      scope(prefix) {
        return new _ClientCache2({
          prefix: [...__privateGet4(this, _prefix), ...Array.isArray(prefix) ? prefix : [prefix]],
          cache: __privateGet4(this, _cache)
        });
      }
    };
    _prefix = /* @__PURE__ */ new WeakMap();
    _cache = /* @__PURE__ */ new WeakMap();
    ClientCache = _ClientCache;
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/experimental/client.js
var Experimental_BaseClient;
var init_client = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/experimental/client.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_cache();
    Experimental_BaseClient = class {
      static {
        __name(this, "Experimental_BaseClient");
      }
      constructor({
        network,
        base,
        cache = base?.cache ?? new ClientCache()
      }) {
        this.network = network;
        this.base = base ?? this;
        this.cache = cache;
      }
      $extend(...registrations) {
        return Object.create(
          this,
          Object.fromEntries(
            registrations.map((registration) => {
              return [registration.name, { value: registration.register(this) }];
            })
          )
        );
      }
    };
  }
});

// ../../node_modules/.pnpm/valibot@1.4.0_typescript@5.9.3/node_modules/valibot/dist/index.mjs
// @__NO_SIDE_EFFECTS__
function getGlobalConfig(config$1) {
  if (!config$1 && !store$4) return DEFAULT_CONFIG;
  return {
    lang: config$1?.lang ?? store$4?.lang,
    message: config$1?.message,
    abortEarly: config$1?.abortEarly ?? store$4?.abortEarly,
    abortPipeEarly: config$1?.abortPipeEarly ?? store$4?.abortPipeEarly
  };
}
// @__NO_SIDE_EFFECTS__
function getGlobalMessage(lang) {
  return store$3?.get(lang);
}
// @__NO_SIDE_EFFECTS__
function getSchemaMessage(lang) {
  return store$2?.get(lang);
}
// @__NO_SIDE_EFFECTS__
function getSpecificMessage(reference, lang) {
  return store$1?.get(reference)?.get(lang);
}
// @__NO_SIDE_EFFECTS__
function _stringify(input) {
  const type = typeof input;
  if (type === "string") return `"${input}"`;
  if (type === "number" || type === "bigint" || type === "boolean") return `${input}`;
  if (type === "object" || type === "function") return (input && Object.getPrototypeOf(input)?.constructor?.name) ?? "null";
  return type;
}
function _addIssue(context2, label, dataset, config$1, other) {
  const input = other && "input" in other ? other.input : dataset.value;
  const expected = other?.expected ?? context2.expects ?? null;
  const received = other?.received ?? /* @__PURE__ */ _stringify(input);
  const issue = {
    kind: context2.kind,
    type: context2.type,
    input,
    expected,
    received,
    message: `Invalid ${label}: ${expected ? `Expected ${expected} but r` : "R"}eceived ${received}`,
    requirement: context2.requirement,
    path: other?.path,
    issues: other?.issues,
    lang: config$1.lang,
    abortEarly: config$1.abortEarly,
    abortPipeEarly: config$1.abortPipeEarly
  };
  const isSchema = context2.kind === "schema";
  const message$1 = other?.message ?? context2.message ?? /* @__PURE__ */ getSpecificMessage(context2.reference, issue.lang) ?? (isSchema ? /* @__PURE__ */ getSchemaMessage(issue.lang) : null) ?? config$1.message ?? /* @__PURE__ */ getGlobalMessage(issue.lang);
  if (message$1 !== void 0) issue.message = typeof message$1 === "function" ? message$1(issue) : message$1;
  if (isSchema) dataset.typed = false;
  if (dataset.issues) dataset.issues.push(issue);
  else dataset.issues = [issue];
}
// @__NO_SIDE_EFFECTS__
function _getStandardProps(context2) {
  let cached = _standardCache.get(context2);
  if (!cached) {
    cached = {
      version: 1,
      vendor: "valibot",
      validate(value$1) {
        return context2["~run"]({ value: value$1 }, /* @__PURE__ */ getGlobalConfig());
      }
    };
    _standardCache.set(context2, cached);
  }
  return cached;
}
// @__NO_SIDE_EFFECTS__
function _isValidObjectKey(object$1, key) {
  return Object.prototype.hasOwnProperty.call(object$1, key) && key !== "__proto__" && key !== "prototype" && key !== "constructor";
}
// @__NO_SIDE_EFFECTS__
function _joinExpects(values$1, separator) {
  const list = [...new Set(values$1)];
  if (list.length > 1) return `(${list.join(` ${separator} `)})`;
  return list[0] ?? "never";
}
// @__NO_SIDE_EFFECTS__
function check(requirement, message$1) {
  return {
    kind: "validation",
    type: "check",
    reference: check,
    async: false,
    expects: null,
    requirement,
    message: message$1,
    "~run"(dataset, config$1) {
      if (dataset.typed && !this.requirement(dataset.value)) _addIssue(this, "input", dataset, config$1);
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function integer(message$1) {
  return {
    kind: "validation",
    type: "integer",
    reference: integer,
    async: false,
    expects: null,
    requirement: Number.isInteger,
    message: message$1,
    "~run"(dataset, config$1) {
      if (dataset.typed && !this.requirement(dataset.value)) _addIssue(this, "integer", dataset, config$1);
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function transform(operation) {
  return {
    kind: "transformation",
    type: "transform",
    reference: transform,
    async: false,
    operation,
    "~run"(dataset) {
      dataset.value = this.operation(dataset.value);
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function getFallback(schema, dataset, config$1) {
  return typeof schema.fallback === "function" ? schema.fallback(dataset, config$1) : schema.fallback;
}
// @__NO_SIDE_EFFECTS__
function getDefault(schema, dataset, config$1) {
  return typeof schema.default === "function" ? schema.default(dataset, config$1) : schema.default;
}
// @__NO_SIDE_EFFECTS__
function is(schema, input) {
  return !schema["~run"]({ value: input }, ABORT_EARLY_CONFIG).issues;
}
// @__NO_SIDE_EFFECTS__
function array(item, message$1) {
  return {
    kind: "schema",
    type: "array",
    reference: array,
    expects: "Array",
    async: false,
    item,
    message: message$1,
    get "~standard"() {
      return /* @__PURE__ */ _getStandardProps(this);
    },
    "~run"(dataset, config$1) {
      const input = dataset.value;
      if (Array.isArray(input)) {
        dataset.typed = true;
        dataset.value = [];
        for (let key = 0; key < input.length; key++) {
          const value$1 = input[key];
          const itemDataset = this.item["~run"]({ value: value$1 }, config$1);
          if (itemDataset.issues) {
            const pathItem = {
              type: "array",
              origin: "value",
              input,
              key,
              value: value$1
            };
            for (const issue of itemDataset.issues) {
              if (issue.path) issue.path.unshift(pathItem);
              else issue.path = [pathItem];
              dataset.issues?.push(issue);
            }
            if (!dataset.issues) dataset.issues = itemDataset.issues;
            if (config$1.abortEarly) {
              dataset.typed = false;
              break;
            }
          }
          if (!itemDataset.typed) dataset.typed = false;
          dataset.value.push(itemDataset.value);
        }
      } else _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function bigint2(message$1) {
  return {
    kind: "schema",
    type: "bigint",
    reference: bigint2,
    expects: "bigint",
    async: false,
    message: message$1,
    get "~standard"() {
      return /* @__PURE__ */ _getStandardProps(this);
    },
    "~run"(dataset, config$1) {
      if (typeof dataset.value === "bigint") dataset.typed = true;
      else _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function boolean(message$1) {
  return {
    kind: "schema",
    type: "boolean",
    reference: boolean,
    expects: "boolean",
    async: false,
    message: message$1,
    get "~standard"() {
      return /* @__PURE__ */ _getStandardProps(this);
    },
    "~run"(dataset, config$1) {
      if (typeof dataset.value === "boolean") dataset.typed = true;
      else _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function lazy(getter) {
  return {
    kind: "schema",
    type: "lazy",
    reference: lazy,
    expects: "unknown",
    async: false,
    getter,
    get "~standard"() {
      return /* @__PURE__ */ _getStandardProps(this);
    },
    "~run"(dataset, config$1) {
      return this.getter(dataset.value)["~run"](dataset, config$1);
    }
  };
}
// @__NO_SIDE_EFFECTS__
function literal(literal_, message$1) {
  return {
    kind: "schema",
    type: "literal",
    reference: literal,
    expects: /* @__PURE__ */ _stringify(literal_),
    async: false,
    literal: literal_,
    message: message$1,
    get "~standard"() {
      return /* @__PURE__ */ _getStandardProps(this);
    },
    "~run"(dataset, config$1) {
      if (dataset.value === this.literal) dataset.typed = true;
      else _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function nullable(wrapped, default_) {
  return {
    kind: "schema",
    type: "nullable",
    reference: nullable,
    expects: `(${wrapped.expects} | null)`,
    async: false,
    wrapped,
    default: default_,
    get "~standard"() {
      return /* @__PURE__ */ _getStandardProps(this);
    },
    "~run"(dataset, config$1) {
      if (dataset.value === null) {
        if (this.default !== void 0) dataset.value = /* @__PURE__ */ getDefault(this, dataset, config$1);
        if (dataset.value === null) {
          dataset.typed = true;
          return dataset;
        }
      }
      return this.wrapped["~run"](dataset, config$1);
    }
  };
}
// @__NO_SIDE_EFFECTS__
function nullish(wrapped, default_) {
  return {
    kind: "schema",
    type: "nullish",
    reference: nullish,
    expects: `(${wrapped.expects} | null | undefined)`,
    async: false,
    wrapped,
    default: default_,
    get "~standard"() {
      return /* @__PURE__ */ _getStandardProps(this);
    },
    "~run"(dataset, config$1) {
      if (dataset.value === null || dataset.value === void 0) {
        if (this.default !== void 0) dataset.value = /* @__PURE__ */ getDefault(this, dataset, config$1);
        if (dataset.value === null || dataset.value === void 0) {
          dataset.typed = true;
          return dataset;
        }
      }
      return this.wrapped["~run"](dataset, config$1);
    }
  };
}
// @__NO_SIDE_EFFECTS__
function number(message$1) {
  return {
    kind: "schema",
    type: "number",
    reference: number,
    expects: "number",
    async: false,
    message: message$1,
    get "~standard"() {
      return /* @__PURE__ */ _getStandardProps(this);
    },
    "~run"(dataset, config$1) {
      if (typeof dataset.value === "number" && !isNaN(dataset.value)) dataset.typed = true;
      else _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function object(entries$1, message$1) {
  return {
    kind: "schema",
    type: "object",
    reference: object,
    expects: "Object",
    async: false,
    entries: entries$1,
    message: message$1,
    get "~standard"() {
      return /* @__PURE__ */ _getStandardProps(this);
    },
    "~run"(dataset, config$1) {
      const input = dataset.value;
      if (input && typeof input === "object") {
        dataset.typed = true;
        dataset.value = {};
        for (const key in this.entries) {
          const valueSchema = this.entries[key];
          if (key in input || (valueSchema.type === "exact_optional" || valueSchema.type === "optional" || valueSchema.type === "nullish") && valueSchema.default !== void 0) {
            const value$1 = key in input ? input[key] : /* @__PURE__ */ getDefault(valueSchema);
            const valueDataset = valueSchema["~run"]({ value: value$1 }, config$1);
            if (valueDataset.issues) {
              const pathItem = {
                type: "object",
                origin: "value",
                input,
                key,
                value: value$1
              };
              for (const issue of valueDataset.issues) {
                if (issue.path) issue.path.unshift(pathItem);
                else issue.path = [pathItem];
                dataset.issues?.push(issue);
              }
              if (!dataset.issues) dataset.issues = valueDataset.issues;
              if (config$1.abortEarly) {
                dataset.typed = false;
                break;
              }
            }
            if (!valueDataset.typed) dataset.typed = false;
            dataset.value[key] = valueDataset.value;
          } else if (valueSchema.fallback !== void 0) dataset.value[key] = /* @__PURE__ */ getFallback(valueSchema);
          else if (valueSchema.type !== "exact_optional" && valueSchema.type !== "optional" && valueSchema.type !== "nullish") {
            _addIssue(this, "key", dataset, config$1, {
              input: void 0,
              expected: `"${key}"`,
              path: [{
                type: "object",
                origin: "key",
                input,
                key,
                value: input[key]
              }]
            });
            if (config$1.abortEarly) break;
          }
        }
      } else _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function optional(wrapped, default_) {
  return {
    kind: "schema",
    type: "optional",
    reference: optional,
    expects: `(${wrapped.expects} | undefined)`,
    async: false,
    wrapped,
    default: default_,
    get "~standard"() {
      return /* @__PURE__ */ _getStandardProps(this);
    },
    "~run"(dataset, config$1) {
      if (dataset.value === void 0) {
        if (this.default !== void 0) dataset.value = /* @__PURE__ */ getDefault(this, dataset, config$1);
        if (dataset.value === void 0) {
          dataset.typed = true;
          return dataset;
        }
      }
      return this.wrapped["~run"](dataset, config$1);
    }
  };
}
// @__NO_SIDE_EFFECTS__
function record(key, value$1, message$1) {
  return {
    kind: "schema",
    type: "record",
    reference: record,
    expects: "Object",
    async: false,
    key,
    value: value$1,
    message: message$1,
    get "~standard"() {
      return /* @__PURE__ */ _getStandardProps(this);
    },
    "~run"(dataset, config$1) {
      const input = dataset.value;
      if (input && typeof input === "object") {
        dataset.typed = true;
        dataset.value = {};
        for (const entryKey in input) if (/* @__PURE__ */ _isValidObjectKey(input, entryKey)) {
          const entryValue = input[entryKey];
          const keyDataset = this.key["~run"]({ value: entryKey }, config$1);
          if (keyDataset.issues) {
            const pathItem = {
              type: "object",
              origin: "key",
              input,
              key: entryKey,
              value: entryValue
            };
            for (const issue of keyDataset.issues) {
              issue.path = [pathItem];
              dataset.issues?.push(issue);
            }
            if (!dataset.issues) dataset.issues = keyDataset.issues;
            if (config$1.abortEarly) {
              dataset.typed = false;
              break;
            }
          }
          const valueDataset = this.value["~run"]({ value: entryValue }, config$1);
          if (valueDataset.issues) {
            const pathItem = {
              type: "object",
              origin: "value",
              input,
              key: entryKey,
              value: entryValue
            };
            for (const issue of valueDataset.issues) {
              if (issue.path) issue.path.unshift(pathItem);
              else issue.path = [pathItem];
              dataset.issues?.push(issue);
            }
            if (!dataset.issues) dataset.issues = valueDataset.issues;
            if (config$1.abortEarly) {
              dataset.typed = false;
              break;
            }
          }
          if (!keyDataset.typed || !valueDataset.typed) dataset.typed = false;
          if (keyDataset.typed) dataset.value[keyDataset.value] = valueDataset.value;
        }
      } else _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function string(message$1) {
  return {
    kind: "schema",
    type: "string",
    reference: string,
    expects: "string",
    async: false,
    message: message$1,
    get "~standard"() {
      return /* @__PURE__ */ _getStandardProps(this);
    },
    "~run"(dataset, config$1) {
      if (typeof dataset.value === "string") dataset.typed = true;
      else _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function tuple(items, message$1) {
  return {
    kind: "schema",
    type: "tuple",
    reference: tuple,
    expects: "Array",
    async: false,
    items,
    message: message$1,
    get "~standard"() {
      return /* @__PURE__ */ _getStandardProps(this);
    },
    "~run"(dataset, config$1) {
      const input = dataset.value;
      if (Array.isArray(input)) {
        dataset.typed = true;
        dataset.value = [];
        for (let key = 0; key < this.items.length; key++) {
          const value$1 = input[key];
          const itemDataset = this.items[key]["~run"]({ value: value$1 }, config$1);
          if (itemDataset.issues) {
            const pathItem = {
              type: "array",
              origin: "value",
              input,
              key,
              value: value$1
            };
            for (const issue of itemDataset.issues) {
              if (issue.path) issue.path.unshift(pathItem);
              else issue.path = [pathItem];
              dataset.issues?.push(issue);
            }
            if (!dataset.issues) dataset.issues = itemDataset.issues;
            if (config$1.abortEarly) {
              dataset.typed = false;
              break;
            }
          }
          if (!itemDataset.typed) dataset.typed = false;
          dataset.value.push(itemDataset.value);
        }
      } else _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function _subIssues(datasets) {
  let issues;
  if (datasets) for (const dataset of datasets) if (issues) for (const issue of dataset.issues) issues.push(issue);
  else issues = dataset.issues;
  return issues;
}
// @__NO_SIDE_EFFECTS__
function union(options, message$1) {
  return {
    kind: "schema",
    type: "union",
    reference: union,
    expects: /* @__PURE__ */ _joinExpects(options.map((option2) => option2.expects), "|"),
    async: false,
    options,
    message: message$1,
    get "~standard"() {
      return /* @__PURE__ */ _getStandardProps(this);
    },
    "~run"(dataset, config$1) {
      let validDataset;
      let typedDatasets;
      let untypedDatasets;
      for (const schema of this.options) {
        const optionDataset = schema["~run"]({ value: dataset.value }, config$1);
        if (optionDataset.typed) if (optionDataset.issues) if (typedDatasets) typedDatasets.push(optionDataset);
        else typedDatasets = [optionDataset];
        else {
          validDataset = optionDataset;
          break;
        }
        else if (untypedDatasets) untypedDatasets.push(optionDataset);
        else untypedDatasets = [optionDataset];
      }
      if (validDataset) return validDataset;
      if (typedDatasets) {
        if (typedDatasets.length === 1) return typedDatasets[0];
        _addIssue(this, "type", dataset, config$1, { issues: /* @__PURE__ */ _subIssues(typedDatasets) });
        dataset.typed = true;
      } else if (untypedDatasets?.length === 1) return untypedDatasets[0];
      else _addIssue(this, "type", dataset, config$1, { issues: /* @__PURE__ */ _subIssues(untypedDatasets) });
      return dataset;
    }
  };
}
// @__NO_SIDE_EFFECTS__
function unknown() {
  return {
    kind: "schema",
    type: "unknown",
    reference: unknown,
    expects: "unknown",
    async: false,
    get "~standard"() {
      return /* @__PURE__ */ _getStandardProps(this);
    },
    "~run"(dataset) {
      dataset.typed = true;
      return dataset;
    }
  };
}
function parse(schema, input, config$1) {
  const dataset = schema["~run"]({ value: input }, /* @__PURE__ */ getGlobalConfig(config$1));
  if (dataset.issues) throw new ValiError(dataset.issues);
  return dataset.value;
}
// @__NO_SIDE_EFFECTS__
function pipe(...pipe$1) {
  return {
    ...pipe$1[0],
    pipe: pipe$1,
    get "~standard"() {
      return /* @__PURE__ */ _getStandardProps(this);
    },
    "~run"(dataset, config$1) {
      for (const item of pipe$1) if (item.kind !== "metadata") {
        if (dataset.issues && (item.kind === "schema" || item.kind === "transformation")) {
          dataset.typed = false;
          break;
        }
        if (!dataset.issues || !config$1.abortEarly && !config$1.abortPipeEarly) dataset = item["~run"](dataset, config$1);
      }
      return dataset;
    }
  };
}
var store$4, DEFAULT_CONFIG, store$3, store$2, store$1, _standardCache, ValiError, ABORT_EARLY_CONFIG;
var init_dist = __esm({
  "../../node_modules/.pnpm/valibot@1.4.0_typescript@5.9.3/node_modules/valibot/dist/index.mjs"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    DEFAULT_CONFIG = {
      lang: void 0,
      message: void 0,
      abortEarly: void 0,
      abortPipeEarly: void 0
    };
    __name(getGlobalConfig, "getGlobalConfig");
    __name(getGlobalMessage, "getGlobalMessage");
    __name(getSchemaMessage, "getSchemaMessage");
    __name(getSpecificMessage, "getSpecificMessage");
    __name(_stringify, "_stringify");
    __name(_addIssue, "_addIssue");
    _standardCache = /* @__PURE__ */ new WeakMap();
    __name(_getStandardProps, "_getStandardProps");
    __name(_isValidObjectKey, "_isValidObjectKey");
    __name(_joinExpects, "_joinExpects");
    ValiError = class extends Error {
      static {
        __name(this, "ValiError");
      }
      /**
      * Creates a Valibot error with useful information.
      *
      * @param issues The error issues.
      */
      constructor(issues) {
        super(issues[0].message);
        this.name = "ValiError";
        this.issues = issues;
      }
    };
    __name(check, "check");
    __name(integer, "integer");
    __name(transform, "transform");
    ABORT_EARLY_CONFIG = { abortEarly: true };
    __name(getFallback, "getFallback");
    __name(getDefault, "getDefault");
    __name(is, "is");
    __name(array, "array");
    __name(bigint2, "bigint");
    __name(boolean, "boolean");
    __name(lazy, "lazy");
    __name(literal, "literal");
    __name(nullable, "nullable");
    __name(nullish, "nullish");
    __name(number, "number");
    __name(object, "object");
    __name(optional, "optional");
    __name(record, "record");
    __name(string, "string");
    __name(tuple, "tuple");
    __name(_subIssues, "_subIssues");
    __name(union, "union");
    __name(unknown, "unknown");
    __name(parse, "parse");
    __name(pipe, "pipe");
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/utils/suins.js
function isValidSuiNSName(name) {
  if (name.length > MAX_SUI_NS_NAME_LENGTH) {
    return false;
  }
  if (name.includes("@")) {
    return SUI_NS_NAME_REGEX.test(name);
  }
  return SUI_NS_DOMAIN_REGEX.test(name);
}
function normalizeSuiNSName(name, format = "at") {
  const lowerCase = name.toLowerCase();
  let parts;
  if (lowerCase.includes("@")) {
    if (!SUI_NS_NAME_REGEX.test(lowerCase)) {
      throw new Error(`Invalid SuiNS name ${name}`);
    }
    const [labels, domain2] = lowerCase.split("@");
    parts = [...labels ? labels.split(".") : [], domain2];
  } else {
    if (!SUI_NS_DOMAIN_REGEX.test(lowerCase)) {
      throw new Error(`Invalid SuiNS name ${name}`);
    }
    parts = lowerCase.split(".").slice(0, -1);
  }
  if (format === "dot") {
    return `${parts.join(".")}.sui`;
  }
  return `${parts.slice(0, -1).join(".")}@${parts[parts.length - 1]}`;
}
var SUI_NS_NAME_REGEX, SUI_NS_DOMAIN_REGEX, MAX_SUI_NS_NAME_LENGTH;
var init_suins = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/utils/suins.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    SUI_NS_NAME_REGEX = /^(?!.*(^(?!@)|[-.@])($|[-.@]))(?:[a-z0-9-]{0,63}(?:\.[a-z0-9-]{0,63})*)?@[a-z0-9-]{0,63}$/i;
    SUI_NS_DOMAIN_REGEX = /^(?!.*(^|[-.])($|[-.]))(?:[a-z0-9-]{0,63}\.)+sui$/i;
    MAX_SUI_NS_NAME_LENGTH = 235;
    __name(isValidSuiNSName, "isValidSuiNSName");
    __name(normalizeSuiNSName, "normalizeSuiNSName");
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/utils/move-registry.js
var NAME_PATTERN, VERSION_REGEX, MAX_APP_SIZE, NAME_SEPARATOR, isValidNamedPackage, isValidNamedType;
var init_move_registry = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/utils/move-registry.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_suins();
    NAME_PATTERN = /^([a-z0-9]+(?:-[a-z0-9]+)*)$/;
    VERSION_REGEX = /^\d+$/;
    MAX_APP_SIZE = 64;
    NAME_SEPARATOR = "/";
    isValidNamedPackage = /* @__PURE__ */ __name((name) => {
      const parts = name.split(NAME_SEPARATOR);
      if (parts.length < 2 || parts.length > 3) return false;
      const [org, app, version2] = parts;
      if (version2 !== void 0 && !VERSION_REGEX.test(version2)) return false;
      if (!isValidSuiNSName(org)) return false;
      return NAME_PATTERN.test(app) && app.length < MAX_APP_SIZE;
    }, "isValidNamedPackage");
    isValidNamedType = /* @__PURE__ */ __name((type) => {
      const splitType = type.split(/::|<|>|,/);
      for (const t of splitType) {
        if (t.includes(NAME_SEPARATOR) && !isValidNamedPackage(t)) return false;
      }
      return true;
    }, "isValidNamedType");
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/utils/sui-types.js
function isValidTransactionDigest(value) {
  try {
    const buffer = fromBase58(value);
    return buffer.length === TX_DIGEST_LENGTH;
  } catch {
    return false;
  }
}
function isValidSuiAddress(value) {
  return isHex(value) && getHexByteLength(value) === SUI_ADDRESS_LENGTH;
}
function isValidSuiObjectId(value) {
  return isValidSuiAddress(value);
}
function parseTypeTag(type) {
  if (!type.includes("::")) return type;
  return parseStructTag(type);
}
function parseStructTag(type) {
  const [address, module] = type.split("::");
  const isMvrPackage = isValidNamedPackage(address);
  const rest = type.slice(address.length + module.length + 4);
  const name = rest.includes("<") ? rest.slice(0, rest.indexOf("<")) : rest;
  const typeParams = rest.includes("<") ? splitGenericParameters(rest.slice(rest.indexOf("<") + 1, rest.lastIndexOf(">"))).map(
    (typeParam) => parseTypeTag(typeParam.trim())
  ) : [];
  return {
    address: isMvrPackage ? address : normalizeSuiAddress(address),
    module,
    name,
    typeParams
  };
}
function normalizeStructTag(type) {
  const { address, module, name, typeParams } = typeof type === "string" ? parseStructTag(type) : type;
  const formattedTypeParams = typeParams?.length > 0 ? `<${typeParams.map(
    (typeParam) => typeof typeParam === "string" ? typeParam : normalizeStructTag(typeParam)
  ).join(",")}>` : "";
  return `${address}::${module}::${name}${formattedTypeParams}`;
}
function normalizeSuiAddress(value, forceAdd0x = false) {
  let address = value.toLowerCase();
  if (!forceAdd0x && address.startsWith("0x")) {
    address = address.slice(2);
  }
  return `0x${address.padStart(SUI_ADDRESS_LENGTH * 2, "0")}`;
}
function normalizeSuiObjectId(value, forceAdd0x = false) {
  return normalizeSuiAddress(value, forceAdd0x);
}
function isHex(value) {
  return /^(0x|0X)?[a-fA-F0-9]+$/.test(value) && value.length % 2 === 0;
}
function getHexByteLength(value) {
  return /^(0x|0X)/.test(value) ? (value.length - 2) / 2 : value.length / 2;
}
var TX_DIGEST_LENGTH, SUI_ADDRESS_LENGTH;
var init_sui_types = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/utils/sui-types.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm3();
    init_move_registry();
    TX_DIGEST_LENGTH = 32;
    __name(isValidTransactionDigest, "isValidTransactionDigest");
    SUI_ADDRESS_LENGTH = 32;
    __name(isValidSuiAddress, "isValidSuiAddress");
    __name(isValidSuiObjectId, "isValidSuiObjectId");
    __name(parseTypeTag, "parseTypeTag");
    __name(parseStructTag, "parseStructTag");
    __name(normalizeStructTag, "normalizeStructTag");
    __name(normalizeSuiAddress, "normalizeSuiAddress");
    __name(normalizeSuiObjectId, "normalizeSuiObjectId");
    __name(isHex, "isHex");
    __name(getHexByteLength, "getHexByteLength");
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/data/internal.js
function safeEnum(options) {
  const unionOptions = Object.entries(options).map(([key, value]) => object({ [key]: value }));
  return pipe(
    union(unionOptions),
    transform(
      (value) => ({
        ...value,
        $kind: Object.keys(value)[0]
      })
    )
  );
}
var SuiAddress, ObjectID, BCSBytes, JsonU64, ObjectRefSchema, ArgumentSchema, GasDataSchema, StructTagSchema, OpenMoveTypeSignatureBodySchema, OpenMoveTypeSignatureSchema, ProgrammableMoveCallSchema, $Intent, CommandSchema, ObjectArgSchema, CallArgSchema, NormalizedCallArg, TransactionExpiration, TransactionDataSchema;
var init_internal = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/data/internal.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_dist();
    init_sui_types();
    __name(safeEnum, "safeEnum");
    SuiAddress = pipe(
      string(),
      transform((value) => normalizeSuiAddress(value)),
      check(isValidSuiAddress)
    );
    ObjectID = SuiAddress;
    BCSBytes = string();
    JsonU64 = pipe(
      union([string(), pipe(number(), integer())]),
      check((val) => {
        try {
          BigInt(val);
          return BigInt(val) >= 0 && BigInt(val) <= 18446744073709551615n;
        } catch {
          return false;
        }
      }, "Invalid u64")
    );
    ObjectRefSchema = object({
      objectId: SuiAddress,
      version: JsonU64,
      digest: string()
    });
    ArgumentSchema = pipe(
      union([
        object({ GasCoin: literal(true) }),
        object({ Input: pipe(number(), integer()), type: optional(literal("pure")) }),
        object({ Input: pipe(number(), integer()), type: optional(literal("object")) }),
        object({ Result: pipe(number(), integer()) }),
        object({ NestedResult: tuple([pipe(number(), integer()), pipe(number(), integer())]) })
      ]),
      transform((value) => ({
        ...value,
        $kind: Object.keys(value)[0]
      }))
      // Defined manually to add `type?: 'pure' | 'object'` to Input
    );
    GasDataSchema = object({
      budget: nullable(JsonU64),
      price: nullable(JsonU64),
      owner: nullable(SuiAddress),
      payment: nullable(array(ObjectRefSchema))
    });
    StructTagSchema = object({
      address: string(),
      module: string(),
      name: string(),
      // type_params in rust, should be updated to use camelCase
      typeParams: array(string())
    });
    OpenMoveTypeSignatureBodySchema = union([
      literal("address"),
      literal("bool"),
      literal("u8"),
      literal("u16"),
      literal("u32"),
      literal("u64"),
      literal("u128"),
      literal("u256"),
      object({ vector: lazy(() => OpenMoveTypeSignatureBodySchema) }),
      object({
        datatype: object({
          package: string(),
          module: string(),
          type: string(),
          typeParameters: array(lazy(() => OpenMoveTypeSignatureBodySchema))
        })
      }),
      object({ typeParameter: pipe(number(), integer()) })
    ]);
    OpenMoveTypeSignatureSchema = object({
      ref: nullable(union([literal("&"), literal("&mut")])),
      body: OpenMoveTypeSignatureBodySchema
    });
    ProgrammableMoveCallSchema = object({
      package: ObjectID,
      module: string(),
      function: string(),
      // snake case in rust
      typeArguments: array(string()),
      arguments: array(ArgumentSchema),
      _argumentTypes: optional(nullable(array(OpenMoveTypeSignatureSchema)))
    });
    $Intent = object({
      name: string(),
      inputs: record(string(), union([ArgumentSchema, array(ArgumentSchema)])),
      data: record(string(), unknown())
    });
    CommandSchema = safeEnum({
      MoveCall: ProgrammableMoveCallSchema,
      TransferObjects: object({
        objects: array(ArgumentSchema),
        address: ArgumentSchema
      }),
      SplitCoins: object({
        coin: ArgumentSchema,
        amounts: array(ArgumentSchema)
      }),
      MergeCoins: object({
        destination: ArgumentSchema,
        sources: array(ArgumentSchema)
      }),
      Publish: object({
        modules: array(BCSBytes),
        dependencies: array(ObjectID)
      }),
      MakeMoveVec: object({
        type: nullable(string()),
        elements: array(ArgumentSchema)
      }),
      Upgrade: object({
        modules: array(BCSBytes),
        dependencies: array(ObjectID),
        package: ObjectID,
        ticket: ArgumentSchema
      }),
      $Intent
    });
    ObjectArgSchema = safeEnum({
      ImmOrOwnedObject: ObjectRefSchema,
      SharedObject: object({
        objectId: ObjectID,
        // snake case in rust
        initialSharedVersion: JsonU64,
        mutable: boolean()
      }),
      Receiving: ObjectRefSchema
    });
    CallArgSchema = safeEnum({
      Object: ObjectArgSchema,
      Pure: object({
        bytes: BCSBytes
      }),
      UnresolvedPure: object({
        value: unknown()
      }),
      UnresolvedObject: object({
        objectId: ObjectID,
        version: optional(nullable(JsonU64)),
        digest: optional(nullable(string())),
        initialSharedVersion: optional(nullable(JsonU64)),
        mutable: optional(nullable(boolean()))
      })
    });
    NormalizedCallArg = safeEnum({
      Object: ObjectArgSchema,
      Pure: object({
        bytes: BCSBytes
      })
    });
    TransactionExpiration = safeEnum({
      None: literal(true),
      Epoch: JsonU64
    });
    TransactionDataSchema = object({
      version: literal(2),
      sender: nullish(SuiAddress),
      expiration: nullish(TransactionExpiration),
      gasData: GasDataSchema,
      inputs: array(CallArgSchema),
      commands: array(CommandSchema)
    });
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/bcs/type-tag-serializer.js
var VECTOR_REGEX, STRUCT_REGEX, TypeTagSerializer;
var init_type_tag_serializer = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/bcs/type-tag-serializer.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm3();
    init_sui_types();
    VECTOR_REGEX = /^vector<(.+)>$/;
    STRUCT_REGEX = /^([^:]+)::([^:]+)::([^<]+)(<(.+)>)?/;
    TypeTagSerializer = class _TypeTagSerializer {
      static {
        __name(this, "TypeTagSerializer");
      }
      static parseFromStr(str, normalizeAddress = false) {
        if (str === "address") {
          return { address: null };
        } else if (str === "bool") {
          return { bool: null };
        } else if (str === "u8") {
          return { u8: null };
        } else if (str === "u16") {
          return { u16: null };
        } else if (str === "u32") {
          return { u32: null };
        } else if (str === "u64") {
          return { u64: null };
        } else if (str === "u128") {
          return { u128: null };
        } else if (str === "u256") {
          return { u256: null };
        } else if (str === "signer") {
          return { signer: null };
        }
        const vectorMatch = str.match(VECTOR_REGEX);
        if (vectorMatch) {
          return {
            vector: _TypeTagSerializer.parseFromStr(vectorMatch[1], normalizeAddress)
          };
        }
        const structMatch = str.match(STRUCT_REGEX);
        if (structMatch) {
          const address = normalizeAddress ? normalizeSuiAddress(structMatch[1]) : structMatch[1];
          return {
            struct: {
              address,
              module: structMatch[2],
              name: structMatch[3],
              typeParams: structMatch[5] === void 0 ? [] : _TypeTagSerializer.parseStructTypeArgs(structMatch[5], normalizeAddress)
            }
          };
        }
        throw new Error(`Encountered unexpected token when parsing type args for ${str}`);
      }
      static parseStructTypeArgs(str, normalizeAddress = false) {
        return splitGenericParameters(str).map(
          (tok) => _TypeTagSerializer.parseFromStr(tok, normalizeAddress)
        );
      }
      static tagToString(tag) {
        if ("bool" in tag) {
          return "bool";
        }
        if ("u8" in tag) {
          return "u8";
        }
        if ("u16" in tag) {
          return "u16";
        }
        if ("u32" in tag) {
          return "u32";
        }
        if ("u64" in tag) {
          return "u64";
        }
        if ("u128" in tag) {
          return "u128";
        }
        if ("u256" in tag) {
          return "u256";
        }
        if ("address" in tag) {
          return "address";
        }
        if ("signer" in tag) {
          return "signer";
        }
        if ("vector" in tag) {
          return `vector<${_TypeTagSerializer.tagToString(tag.vector)}>`;
        }
        if ("struct" in tag) {
          const struct = tag.struct;
          const typeParams = struct.typeParams.map(_TypeTagSerializer.tagToString).join(", ");
          return `${struct.address}::${struct.module}::${struct.name}${typeParams ? `<${typeParams}>` : ""}`;
        }
        throw new Error("Invalid TypeTag");
      }
    };
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/bcs/bcs.js
function unsafe_u64(options) {
  return bcs.u64({
    name: "unsafe_u64",
    ...options
  }).transform({
    input: /* @__PURE__ */ __name((val) => val, "input"),
    output: /* @__PURE__ */ __name((val) => Number(val), "output")
  });
}
function optionEnum(type) {
  return bcs.enum("Option", {
    None: null,
    Some: type
  });
}
function IntentMessage(T) {
  return bcs.struct(`IntentMessage<${T.name}>`, {
    intent: Intent,
    value: T
  });
}
var Address, ObjectDigest, SuiObjectRef, SharedObjectRef, ObjectArg, Owner, CallArg, InnerTypeTag, TypeTag, Argument, ProgrammableMoveCall, Command, ProgrammableTransaction, TransactionKind, TransactionExpiration2, StructTag, GasData, TransactionDataV1, TransactionData, IntentScope, IntentVersion, AppId, Intent, CompressedSignature, PublicKey, MultiSigPkMap, MultiSigPublicKey, MultiSig, base64String, SenderSignedTransaction, SenderSignedData, PasskeyAuthenticator;
var init_bcs2 = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/bcs/bcs.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm3();
    init_sui_types();
    init_type_tag_serializer();
    __name(unsafe_u64, "unsafe_u64");
    __name(optionEnum, "optionEnum");
    Address = bcs.bytes(SUI_ADDRESS_LENGTH).transform({
      validate: /* @__PURE__ */ __name((val) => {
        const address = typeof val === "string" ? val : toHex(val);
        if (!address || !isValidSuiAddress(normalizeSuiAddress(address))) {
          throw new Error(`Invalid Sui address ${address}`);
        }
      }, "validate"),
      input: /* @__PURE__ */ __name((val) => typeof val === "string" ? fromHex(normalizeSuiAddress(val)) : val, "input"),
      output: /* @__PURE__ */ __name((val) => normalizeSuiAddress(toHex(val)), "output")
    });
    ObjectDigest = bcs.byteVector().transform({
      name: "ObjectDigest",
      input: /* @__PURE__ */ __name((value) => fromBase58(value), "input"),
      output: /* @__PURE__ */ __name((value) => toBase58(new Uint8Array(value)), "output"),
      validate: /* @__PURE__ */ __name((value) => {
        if (fromBase58(value).length !== 32) {
          throw new Error("ObjectDigest must be 32 bytes");
        }
      }, "validate")
    });
    SuiObjectRef = bcs.struct("SuiObjectRef", {
      objectId: Address,
      version: bcs.u64(),
      digest: ObjectDigest
    });
    SharedObjectRef = bcs.struct("SharedObjectRef", {
      objectId: Address,
      initialSharedVersion: bcs.u64(),
      mutable: bcs.bool()
    });
    ObjectArg = bcs.enum("ObjectArg", {
      ImmOrOwnedObject: SuiObjectRef,
      SharedObject: SharedObjectRef,
      Receiving: SuiObjectRef
    });
    Owner = bcs.enum("Owner", {
      AddressOwner: Address,
      ObjectOwner: Address,
      Shared: bcs.struct("Shared", {
        initialSharedVersion: bcs.u64()
      }),
      Immutable: null,
      ConsensusAddressOwner: bcs.struct("ConsensusAddressOwner", {
        owner: Address,
        startVersion: bcs.u64()
      })
    });
    CallArg = bcs.enum("CallArg", {
      Pure: bcs.struct("Pure", {
        bytes: bcs.byteVector().transform({
          input: /* @__PURE__ */ __name((val) => typeof val === "string" ? fromBase64(val) : val, "input"),
          output: /* @__PURE__ */ __name((val) => toBase64(new Uint8Array(val)), "output")
        })
      }),
      Object: ObjectArg
    });
    InnerTypeTag = bcs.enum("TypeTag", {
      bool: null,
      u8: null,
      u64: null,
      u128: null,
      address: null,
      signer: null,
      vector: bcs.lazy(() => InnerTypeTag),
      struct: bcs.lazy(() => StructTag),
      u16: null,
      u32: null,
      u256: null
    });
    TypeTag = InnerTypeTag.transform({
      input: /* @__PURE__ */ __name((typeTag) => typeof typeTag === "string" ? TypeTagSerializer.parseFromStr(typeTag, true) : typeTag, "input"),
      output: /* @__PURE__ */ __name((typeTag) => TypeTagSerializer.tagToString(typeTag), "output")
    });
    Argument = bcs.enum("Argument", {
      GasCoin: null,
      Input: bcs.u16(),
      Result: bcs.u16(),
      NestedResult: bcs.tuple([bcs.u16(), bcs.u16()])
    });
    ProgrammableMoveCall = bcs.struct("ProgrammableMoveCall", {
      package: Address,
      module: bcs.string(),
      function: bcs.string(),
      typeArguments: bcs.vector(TypeTag),
      arguments: bcs.vector(Argument)
    });
    Command = bcs.enum("Command", {
      /**
       * A Move Call - any public Move function can be called via
       * this transaction. The results can be used that instant to pass
       * into the next transaction.
       */
      MoveCall: ProgrammableMoveCall,
      /**
       * Transfer vector of objects to a receiver.
       */
      TransferObjects: bcs.struct("TransferObjects", {
        objects: bcs.vector(Argument),
        address: Argument
      }),
      // /**
      //  * Split `amount` from a `coin`.
      //  */
      SplitCoins: bcs.struct("SplitCoins", {
        coin: Argument,
        amounts: bcs.vector(Argument)
      }),
      // /**
      //  * Merge Vector of Coins (`sources`) into a `destination`.
      //  */
      MergeCoins: bcs.struct("MergeCoins", {
        destination: Argument,
        sources: bcs.vector(Argument)
      }),
      // /**
      //  * Publish a Move module.
      //  */
      Publish: bcs.struct("Publish", {
        modules: bcs.vector(
          bcs.byteVector().transform({
            input: /* @__PURE__ */ __name((val) => typeof val === "string" ? fromBase64(val) : val, "input"),
            output: /* @__PURE__ */ __name((val) => toBase64(new Uint8Array(val)), "output")
          })
        ),
        dependencies: bcs.vector(Address)
      }),
      // /**
      //  * Build a vector of objects using the input arguments.
      //  * It is impossible to export construct a `vector<T: key>` otherwise,
      //  * so this call serves a utility function.
      //  */
      MakeMoveVec: bcs.struct("MakeMoveVec", {
        type: optionEnum(TypeTag).transform({
          input: /* @__PURE__ */ __name((val) => val === null ? {
            None: true
          } : {
            Some: val
          }, "input"),
          output: /* @__PURE__ */ __name((val) => val.Some ?? null, "output")
        }),
        elements: bcs.vector(Argument)
      }),
      Upgrade: bcs.struct("Upgrade", {
        modules: bcs.vector(
          bcs.byteVector().transform({
            input: /* @__PURE__ */ __name((val) => typeof val === "string" ? fromBase64(val) : val, "input"),
            output: /* @__PURE__ */ __name((val) => toBase64(new Uint8Array(val)), "output")
          })
        ),
        dependencies: bcs.vector(Address),
        package: Address,
        ticket: Argument
      })
    });
    ProgrammableTransaction = bcs.struct("ProgrammableTransaction", {
      inputs: bcs.vector(CallArg),
      commands: bcs.vector(Command)
    });
    TransactionKind = bcs.enum("TransactionKind", {
      ProgrammableTransaction,
      ChangeEpoch: null,
      Genesis: null,
      ConsensusCommitPrologue: null
    });
    TransactionExpiration2 = bcs.enum("TransactionExpiration", {
      None: null,
      Epoch: unsafe_u64()
    });
    StructTag = bcs.struct("StructTag", {
      address: Address,
      module: bcs.string(),
      name: bcs.string(),
      typeParams: bcs.vector(InnerTypeTag)
    });
    GasData = bcs.struct("GasData", {
      payment: bcs.vector(SuiObjectRef),
      owner: Address,
      price: bcs.u64(),
      budget: bcs.u64()
    });
    TransactionDataV1 = bcs.struct("TransactionDataV1", {
      kind: TransactionKind,
      sender: Address,
      gasData: GasData,
      expiration: TransactionExpiration2
    });
    TransactionData = bcs.enum("TransactionData", {
      V1: TransactionDataV1
    });
    IntentScope = bcs.enum("IntentScope", {
      TransactionData: null,
      TransactionEffects: null,
      CheckpointSummary: null,
      PersonalMessage: null
    });
    IntentVersion = bcs.enum("IntentVersion", {
      V0: null
    });
    AppId = bcs.enum("AppId", {
      Sui: null
    });
    Intent = bcs.struct("Intent", {
      scope: IntentScope,
      version: IntentVersion,
      appId: AppId
    });
    __name(IntentMessage, "IntentMessage");
    CompressedSignature = bcs.enum("CompressedSignature", {
      ED25519: bcs.bytes(64),
      Secp256k1: bcs.bytes(64),
      Secp256r1: bcs.bytes(64),
      ZkLogin: bcs.byteVector(),
      Passkey: bcs.byteVector()
    });
    PublicKey = bcs.enum("PublicKey", {
      ED25519: bcs.bytes(32),
      Secp256k1: bcs.bytes(33),
      Secp256r1: bcs.bytes(33),
      ZkLogin: bcs.byteVector(),
      Passkey: bcs.bytes(33)
    });
    MultiSigPkMap = bcs.struct("MultiSigPkMap", {
      pubKey: PublicKey,
      weight: bcs.u8()
    });
    MultiSigPublicKey = bcs.struct("MultiSigPublicKey", {
      pk_map: bcs.vector(MultiSigPkMap),
      threshold: bcs.u16()
    });
    MultiSig = bcs.struct("MultiSig", {
      sigs: bcs.vector(CompressedSignature),
      bitmap: bcs.u16(),
      multisig_pk: MultiSigPublicKey
    });
    base64String = bcs.byteVector().transform({
      input: /* @__PURE__ */ __name((val) => typeof val === "string" ? fromBase64(val) : val, "input"),
      output: /* @__PURE__ */ __name((val) => toBase64(new Uint8Array(val)), "output")
    });
    SenderSignedTransaction = bcs.struct("SenderSignedTransaction", {
      intentMessage: IntentMessage(TransactionData),
      txSignatures: bcs.vector(base64String)
    });
    SenderSignedData = bcs.vector(SenderSignedTransaction, {
      name: "SenderSignedData"
    });
    PasskeyAuthenticator = bcs.struct("PasskeyAuthenticator", {
      authenticatorData: bcs.byteVector(),
      clientDataJson: bcs.string(),
      userSignature: bcs.byteVector()
    });
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/bcs/effects.js
var PackageUpgradeError, ModuleId, MoveLocation, CommandArgumentError, TypeArgumentError, ExecutionFailureStatus, ExecutionStatus, GasCostSummary, TransactionEffectsV1, VersionDigest, ObjectIn, ObjectOut, IDOperation, EffectsObjectChange, UnchangedSharedKind, TransactionEffectsV2, TransactionEffects;
var init_effects = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/bcs/effects.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm3();
    init_bcs2();
    PackageUpgradeError = bcs.enum("PackageUpgradeError", {
      UnableToFetchPackage: bcs.struct("UnableToFetchPackage", { packageId: Address }),
      NotAPackage: bcs.struct("NotAPackage", { objectId: Address }),
      IncompatibleUpgrade: null,
      DigestDoesNotMatch: bcs.struct("DigestDoesNotMatch", { digest: bcs.byteVector() }),
      UnknownUpgradePolicy: bcs.struct("UnknownUpgradePolicy", { policy: bcs.u8() }),
      PackageIDDoesNotMatch: bcs.struct("PackageIDDoesNotMatch", {
        packageId: Address,
        ticketId: Address
      })
    });
    ModuleId = bcs.struct("ModuleId", {
      address: Address,
      name: bcs.string()
    });
    MoveLocation = bcs.struct("MoveLocation", {
      module: ModuleId,
      function: bcs.u16(),
      instruction: bcs.u16(),
      functionName: bcs.option(bcs.string())
    });
    CommandArgumentError = bcs.enum("CommandArgumentError", {
      TypeMismatch: null,
      InvalidBCSBytes: null,
      InvalidUsageOfPureArg: null,
      InvalidArgumentToPrivateEntryFunction: null,
      IndexOutOfBounds: bcs.struct("IndexOutOfBounds", { idx: bcs.u16() }),
      SecondaryIndexOutOfBounds: bcs.struct("SecondaryIndexOutOfBounds", {
        resultIdx: bcs.u16(),
        secondaryIdx: bcs.u16()
      }),
      InvalidResultArity: bcs.struct("InvalidResultArity", { resultIdx: bcs.u16() }),
      InvalidGasCoinUsage: null,
      InvalidValueUsage: null,
      InvalidObjectByValue: null,
      InvalidObjectByMutRef: null,
      SharedObjectOperationNotAllowed: null
    });
    TypeArgumentError = bcs.enum("TypeArgumentError", {
      TypeNotFound: null,
      ConstraintNotSatisfied: null
    });
    ExecutionFailureStatus = bcs.enum("ExecutionFailureStatus", {
      InsufficientGas: null,
      InvalidGasObject: null,
      InvariantViolation: null,
      FeatureNotYetSupported: null,
      MoveObjectTooBig: bcs.struct("MoveObjectTooBig", {
        objectSize: bcs.u64(),
        maxObjectSize: bcs.u64()
      }),
      MovePackageTooBig: bcs.struct("MovePackageTooBig", {
        objectSize: bcs.u64(),
        maxObjectSize: bcs.u64()
      }),
      CircularObjectOwnership: bcs.struct("CircularObjectOwnership", { object: Address }),
      InsufficientCoinBalance: null,
      CoinBalanceOverflow: null,
      PublishErrorNonZeroAddress: null,
      SuiMoveVerificationError: null,
      MovePrimitiveRuntimeError: bcs.option(MoveLocation),
      MoveAbort: bcs.tuple([MoveLocation, bcs.u64()]),
      VMVerificationOrDeserializationError: null,
      VMInvariantViolation: null,
      FunctionNotFound: null,
      ArityMismatch: null,
      TypeArityMismatch: null,
      NonEntryFunctionInvoked: null,
      CommandArgumentError: bcs.struct("CommandArgumentError", {
        argIdx: bcs.u16(),
        kind: CommandArgumentError
      }),
      TypeArgumentError: bcs.struct("TypeArgumentError", {
        argumentIdx: bcs.u16(),
        kind: TypeArgumentError
      }),
      UnusedValueWithoutDrop: bcs.struct("UnusedValueWithoutDrop", {
        resultIdx: bcs.u16(),
        secondaryIdx: bcs.u16()
      }),
      InvalidPublicFunctionReturnType: bcs.struct("InvalidPublicFunctionReturnType", {
        idx: bcs.u16()
      }),
      InvalidTransferObject: null,
      EffectsTooLarge: bcs.struct("EffectsTooLarge", { currentSize: bcs.u64(), maxSize: bcs.u64() }),
      PublishUpgradeMissingDependency: null,
      PublishUpgradeDependencyDowngrade: null,
      PackageUpgradeError: bcs.struct("PackageUpgradeError", { upgradeError: PackageUpgradeError }),
      WrittenObjectsTooLarge: bcs.struct("WrittenObjectsTooLarge", {
        currentSize: bcs.u64(),
        maxSize: bcs.u64()
      }),
      CertificateDenied: null,
      SuiMoveVerificationTimedout: null,
      SharedObjectOperationNotAllowed: null,
      InputObjectDeleted: null,
      ExecutionCancelledDueToSharedObjectCongestion: bcs.struct(
        "ExecutionCancelledDueToSharedObjectCongestion",
        {
          congestedObjects: bcs.vector(Address)
        }
      ),
      AddressDeniedForCoin: bcs.struct("AddressDeniedForCoin", {
        address: Address,
        coinType: bcs.string()
      }),
      CoinTypeGlobalPause: bcs.struct("CoinTypeGlobalPause", { coinType: bcs.string() }),
      ExecutionCancelledDueToRandomnessUnavailable: null
    });
    ExecutionStatus = bcs.enum("ExecutionStatus", {
      Success: null,
      Failed: bcs.struct("ExecutionFailed", {
        error: ExecutionFailureStatus,
        command: bcs.option(bcs.u64())
      })
    });
    GasCostSummary = bcs.struct("GasCostSummary", {
      computationCost: bcs.u64(),
      storageCost: bcs.u64(),
      storageRebate: bcs.u64(),
      nonRefundableStorageFee: bcs.u64()
    });
    TransactionEffectsV1 = bcs.struct("TransactionEffectsV1", {
      status: ExecutionStatus,
      executedEpoch: bcs.u64(),
      gasUsed: GasCostSummary,
      modifiedAtVersions: bcs.vector(bcs.tuple([Address, bcs.u64()])),
      sharedObjects: bcs.vector(SuiObjectRef),
      transactionDigest: ObjectDigest,
      created: bcs.vector(bcs.tuple([SuiObjectRef, Owner])),
      mutated: bcs.vector(bcs.tuple([SuiObjectRef, Owner])),
      unwrapped: bcs.vector(bcs.tuple([SuiObjectRef, Owner])),
      deleted: bcs.vector(SuiObjectRef),
      unwrappedThenDeleted: bcs.vector(SuiObjectRef),
      wrapped: bcs.vector(SuiObjectRef),
      gasObject: bcs.tuple([SuiObjectRef, Owner]),
      eventsDigest: bcs.option(ObjectDigest),
      dependencies: bcs.vector(ObjectDigest)
    });
    VersionDigest = bcs.tuple([bcs.u64(), ObjectDigest]);
    ObjectIn = bcs.enum("ObjectIn", {
      NotExist: null,
      Exist: bcs.tuple([VersionDigest, Owner])
    });
    ObjectOut = bcs.enum("ObjectOut", {
      NotExist: null,
      ObjectWrite: bcs.tuple([ObjectDigest, Owner]),
      PackageWrite: VersionDigest
    });
    IDOperation = bcs.enum("IDOperation", {
      None: null,
      Created: null,
      Deleted: null
    });
    EffectsObjectChange = bcs.struct("EffectsObjectChange", {
      inputState: ObjectIn,
      outputState: ObjectOut,
      idOperation: IDOperation
    });
    UnchangedSharedKind = bcs.enum("UnchangedSharedKind", {
      ReadOnlyRoot: VersionDigest,
      // TODO: these have been renamed to MutateConsensusStreamEnded and ReadConsensusStreamEnded
      MutateDeleted: bcs.u64(),
      ReadDeleted: bcs.u64(),
      Cancelled: bcs.u64(),
      PerEpochConfig: null
    });
    TransactionEffectsV2 = bcs.struct("TransactionEffectsV2", {
      status: ExecutionStatus,
      executedEpoch: bcs.u64(),
      gasUsed: GasCostSummary,
      transactionDigest: ObjectDigest,
      gasObjectIndex: bcs.option(bcs.u32()),
      eventsDigest: bcs.option(ObjectDigest),
      dependencies: bcs.vector(ObjectDigest),
      lamportVersion: bcs.u64(),
      changedObjects: bcs.vector(bcs.tuple([Address, EffectsObjectChange])),
      unchangedSharedObjects: bcs.vector(bcs.tuple([Address, UnchangedSharedKind])),
      auxDataDigest: bcs.option(ObjectDigest)
    });
    TransactionEffects = bcs.enum("TransactionEffects", {
      V1: TransactionEffectsV1,
      V2: TransactionEffectsV2
    });
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/bcs/pure.js
function pureBcsSchemaFromTypeName(name) {
  switch (name) {
    case "u8":
      return bcs.u8();
    case "u16":
      return bcs.u16();
    case "u32":
      return bcs.u32();
    case "u64":
      return bcs.u64();
    case "u128":
      return bcs.u128();
    case "u256":
      return bcs.u256();
    case "bool":
      return bcs.bool();
    case "string":
      return bcs.string();
    case "id":
    case "address":
      return Address;
  }
  const generic = name.match(/^(vector|option)<(.+)>$/);
  if (generic) {
    const [kind, inner] = generic.slice(1);
    if (kind === "vector") {
      return bcs.vector(pureBcsSchemaFromTypeName(inner));
    } else {
      return bcs.option(pureBcsSchemaFromTypeName(inner));
    }
  }
  throw new Error(`Invalid Pure type name: ${name}`);
}
var init_pure = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/bcs/pure.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm3();
    init_bcs2();
    __name(pureBcsSchemaFromTypeName, "pureBcsSchemaFromTypeName");
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/bcs/index.js
var suiBcs;
var init_bcs3 = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/bcs/index.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm3();
    init_bcs2();
    init_effects();
    init_type_tag_serializer();
    suiBcs = {
      ...bcs,
      U8: bcs.u8(),
      U16: bcs.u16(),
      U32: bcs.u32(),
      U64: bcs.u64(),
      U128: bcs.u128(),
      U256: bcs.u256(),
      ULEB128: bcs.uleb128(),
      Bool: bcs.bool(),
      String: bcs.string(),
      Address,
      AppId,
      Argument,
      CallArg,
      Command,
      CompressedSignature,
      GasData,
      Intent,
      IntentMessage,
      IntentScope,
      IntentVersion,
      MultiSig,
      MultiSigPkMap,
      MultiSigPublicKey,
      ObjectArg,
      ObjectDigest,
      Owner,
      PasskeyAuthenticator,
      ProgrammableMoveCall,
      ProgrammableTransaction,
      PublicKey,
      SenderSignedData,
      SenderSignedTransaction,
      SharedObjectRef,
      StructTag,
      SuiObjectRef,
      TransactionData,
      TransactionDataV1,
      TransactionEffects,
      TransactionExpiration: TransactionExpiration2,
      TransactionKind,
      TypeTag
    };
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/data/v1.js
function serializeV1TransactionData(transactionData) {
  const inputs = transactionData.inputs.map(
    (input, index) => {
      if (input.Object) {
        return {
          kind: "Input",
          index,
          value: {
            Object: input.Object.ImmOrOwnedObject ? {
              ImmOrOwned: input.Object.ImmOrOwnedObject
            } : input.Object.Receiving ? {
              Receiving: {
                digest: input.Object.Receiving.digest,
                version: input.Object.Receiving.version,
                objectId: input.Object.Receiving.objectId
              }
            } : {
              Shared: {
                mutable: input.Object.SharedObject.mutable,
                initialSharedVersion: input.Object.SharedObject.initialSharedVersion,
                objectId: input.Object.SharedObject.objectId
              }
            }
          },
          type: "object"
        };
      }
      if (input.Pure) {
        return {
          kind: "Input",
          index,
          value: {
            Pure: Array.from(fromBase64(input.Pure.bytes))
          },
          type: "pure"
        };
      }
      if (input.UnresolvedPure) {
        return {
          kind: "Input",
          type: "pure",
          index,
          value: input.UnresolvedPure.value
        };
      }
      if (input.UnresolvedObject) {
        return {
          kind: "Input",
          type: "object",
          index,
          value: input.UnresolvedObject.objectId
        };
      }
      throw new Error("Invalid input");
    }
  );
  return {
    version: 1,
    sender: transactionData.sender ?? void 0,
    expiration: transactionData.expiration?.$kind === "Epoch" ? { Epoch: Number(transactionData.expiration.Epoch) } : transactionData.expiration ? { None: true } : null,
    gasConfig: {
      owner: transactionData.gasData.owner ?? void 0,
      budget: transactionData.gasData.budget ?? void 0,
      price: transactionData.gasData.price ?? void 0,
      payment: transactionData.gasData.payment ?? void 0
    },
    inputs,
    transactions: transactionData.commands.map((command) => {
      if (command.MakeMoveVec) {
        return {
          kind: "MakeMoveVec",
          type: command.MakeMoveVec.type === null ? { None: true } : { Some: TypeTagSerializer.parseFromStr(command.MakeMoveVec.type) },
          objects: command.MakeMoveVec.elements.map(
            (arg) => convertTransactionArgument(arg, inputs)
          )
        };
      }
      if (command.MergeCoins) {
        return {
          kind: "MergeCoins",
          destination: convertTransactionArgument(command.MergeCoins.destination, inputs),
          sources: command.MergeCoins.sources.map((arg) => convertTransactionArgument(arg, inputs))
        };
      }
      if (command.MoveCall) {
        return {
          kind: "MoveCall",
          target: `${command.MoveCall.package}::${command.MoveCall.module}::${command.MoveCall.function}`,
          typeArguments: command.MoveCall.typeArguments,
          arguments: command.MoveCall.arguments.map(
            (arg) => convertTransactionArgument(arg, inputs)
          )
        };
      }
      if (command.Publish) {
        return {
          kind: "Publish",
          modules: command.Publish.modules.map((mod2) => Array.from(fromBase64(mod2))),
          dependencies: command.Publish.dependencies
        };
      }
      if (command.SplitCoins) {
        return {
          kind: "SplitCoins",
          coin: convertTransactionArgument(command.SplitCoins.coin, inputs),
          amounts: command.SplitCoins.amounts.map((arg) => convertTransactionArgument(arg, inputs))
        };
      }
      if (command.TransferObjects) {
        return {
          kind: "TransferObjects",
          objects: command.TransferObjects.objects.map(
            (arg) => convertTransactionArgument(arg, inputs)
          ),
          address: convertTransactionArgument(command.TransferObjects.address, inputs)
        };
      }
      if (command.Upgrade) {
        return {
          kind: "Upgrade",
          modules: command.Upgrade.modules.map((mod2) => Array.from(fromBase64(mod2))),
          dependencies: command.Upgrade.dependencies,
          packageId: command.Upgrade.package,
          ticket: convertTransactionArgument(command.Upgrade.ticket, inputs)
        };
      }
      throw new Error(`Unknown transaction ${Object.keys(command)}`);
    })
  };
}
function convertTransactionArgument(arg, inputs) {
  if (arg.$kind === "GasCoin") {
    return { kind: "GasCoin" };
  }
  if (arg.$kind === "Result") {
    return { kind: "Result", index: arg.Result };
  }
  if (arg.$kind === "NestedResult") {
    return { kind: "NestedResult", index: arg.NestedResult[0], resultIndex: arg.NestedResult[1] };
  }
  if (arg.$kind === "Input") {
    return inputs[arg.Input];
  }
  throw new Error(`Invalid argument ${Object.keys(arg)}`);
}
function transactionDataFromV1(data) {
  return parse(TransactionDataSchema, {
    version: 2,
    sender: data.sender ?? null,
    expiration: data.expiration ? "Epoch" in data.expiration ? { Epoch: data.expiration.Epoch } : { None: true } : null,
    gasData: {
      owner: data.gasConfig.owner ?? null,
      budget: data.gasConfig.budget?.toString() ?? null,
      price: data.gasConfig.price?.toString() ?? null,
      payment: data.gasConfig.payment?.map((ref2) => ({
        digest: ref2.digest,
        objectId: ref2.objectId,
        version: ref2.version.toString()
      })) ?? null
    },
    inputs: data.inputs.map((input) => {
      if (input.kind === "Input") {
        if (is(NormalizedCallArg2, input.value)) {
          const value = parse(NormalizedCallArg2, input.value);
          if (value.Object) {
            if (value.Object.ImmOrOwned) {
              return {
                Object: {
                  ImmOrOwnedObject: {
                    objectId: value.Object.ImmOrOwned.objectId,
                    version: String(value.Object.ImmOrOwned.version),
                    digest: value.Object.ImmOrOwned.digest
                  }
                }
              };
            }
            if (value.Object.Shared) {
              return {
                Object: {
                  SharedObject: {
                    mutable: value.Object.Shared.mutable ?? null,
                    initialSharedVersion: value.Object.Shared.initialSharedVersion,
                    objectId: value.Object.Shared.objectId
                  }
                }
              };
            }
            if (value.Object.Receiving) {
              return {
                Object: {
                  Receiving: {
                    digest: value.Object.Receiving.digest,
                    version: String(value.Object.Receiving.version),
                    objectId: value.Object.Receiving.objectId
                  }
                }
              };
            }
            throw new Error("Invalid object input");
          }
          return {
            Pure: {
              bytes: toBase64(new Uint8Array(value.Pure))
            }
          };
        }
        if (input.type === "object") {
          return {
            UnresolvedObject: {
              objectId: input.value
            }
          };
        }
        return {
          UnresolvedPure: {
            value: input.value
          }
        };
      }
      throw new Error("Invalid input");
    }),
    commands: data.transactions.map((transaction) => {
      switch (transaction.kind) {
        case "MakeMoveVec":
          return {
            MakeMoveVec: {
              type: "Some" in transaction.type ? TypeTagSerializer.tagToString(transaction.type.Some) : null,
              elements: transaction.objects.map((arg) => parseV1TransactionArgument(arg))
            }
          };
        case "MergeCoins": {
          return {
            MergeCoins: {
              destination: parseV1TransactionArgument(transaction.destination),
              sources: transaction.sources.map((arg) => parseV1TransactionArgument(arg))
            }
          };
        }
        case "MoveCall": {
          const [pkg, mod2, fn] = transaction.target.split("::");
          return {
            MoveCall: {
              package: pkg,
              module: mod2,
              function: fn,
              typeArguments: transaction.typeArguments,
              arguments: transaction.arguments.map((arg) => parseV1TransactionArgument(arg))
            }
          };
        }
        case "Publish": {
          return {
            Publish: {
              modules: transaction.modules.map((mod2) => toBase64(Uint8Array.from(mod2))),
              dependencies: transaction.dependencies
            }
          };
        }
        case "SplitCoins": {
          return {
            SplitCoins: {
              coin: parseV1TransactionArgument(transaction.coin),
              amounts: transaction.amounts.map((arg) => parseV1TransactionArgument(arg))
            }
          };
        }
        case "TransferObjects": {
          return {
            TransferObjects: {
              objects: transaction.objects.map((arg) => parseV1TransactionArgument(arg)),
              address: parseV1TransactionArgument(transaction.address)
            }
          };
        }
        case "Upgrade": {
          return {
            Upgrade: {
              modules: transaction.modules.map((mod2) => toBase64(Uint8Array.from(mod2))),
              dependencies: transaction.dependencies,
              package: transaction.packageId,
              ticket: parseV1TransactionArgument(transaction.ticket)
            }
          };
        }
      }
      throw new Error(`Unknown transaction ${Object.keys(transaction)}`);
    })
  });
}
function parseV1TransactionArgument(arg) {
  switch (arg.kind) {
    case "GasCoin": {
      return { GasCoin: true };
    }
    case "Result":
      return { Result: arg.index };
    case "NestedResult": {
      return { NestedResult: [arg.index, arg.resultIndex] };
    }
    case "Input": {
      return { Input: arg.index };
    }
  }
}
var ObjectRef, ObjectArg2, NormalizedCallArg2, TransactionInput, TransactionExpiration3, StringEncodedBigint, TypeTag2, StructTag2, GasConfig, TransactionArgumentTypes, TransactionArgument, MoveCallTransaction, TransferObjectsTransaction, SplitCoinsTransaction, MergeCoinsTransaction, MakeMoveVecTransaction, PublishTransaction, UpgradeTransaction, TransactionTypes, TransactionType, SerializedTransactionDataV1;
var init_v1 = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/data/v1.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm3();
    init_dist();
    init_bcs3();
    init_internal();
    ObjectRef = object({
      digest: string(),
      objectId: string(),
      version: union([pipe(number(), integer()), string(), bigint2()])
    });
    ObjectArg2 = safeEnum({
      ImmOrOwned: ObjectRef,
      Shared: object({
        objectId: ObjectID,
        initialSharedVersion: JsonU64,
        mutable: boolean()
      }),
      Receiving: ObjectRef
    });
    NormalizedCallArg2 = safeEnum({
      Object: ObjectArg2,
      Pure: array(pipe(number(), integer()))
    });
    TransactionInput = union([
      object({
        kind: literal("Input"),
        index: pipe(number(), integer()),
        value: unknown(),
        type: optional(literal("object"))
      }),
      object({
        kind: literal("Input"),
        index: pipe(number(), integer()),
        value: unknown(),
        type: literal("pure")
      })
    ]);
    TransactionExpiration3 = union([
      object({ Epoch: pipe(number(), integer()) }),
      object({ None: nullable(literal(true)) })
    ]);
    StringEncodedBigint = pipe(
      union([number(), string(), bigint2()]),
      check((val) => {
        if (!["string", "number", "bigint"].includes(typeof val)) return false;
        try {
          BigInt(val);
          return true;
        } catch {
          return false;
        }
      })
    );
    TypeTag2 = union([
      object({ bool: nullable(literal(true)) }),
      object({ u8: nullable(literal(true)) }),
      object({ u64: nullable(literal(true)) }),
      object({ u128: nullable(literal(true)) }),
      object({ address: nullable(literal(true)) }),
      object({ signer: nullable(literal(true)) }),
      object({ vector: lazy(() => TypeTag2) }),
      object({ struct: lazy(() => StructTag2) }),
      object({ u16: nullable(literal(true)) }),
      object({ u32: nullable(literal(true)) }),
      object({ u256: nullable(literal(true)) })
    ]);
    StructTag2 = object({
      address: string(),
      module: string(),
      name: string(),
      typeParams: array(TypeTag2)
    });
    GasConfig = object({
      budget: optional(StringEncodedBigint),
      price: optional(StringEncodedBigint),
      payment: optional(array(ObjectRef)),
      owner: optional(string())
    });
    TransactionArgumentTypes = [
      TransactionInput,
      object({ kind: literal("GasCoin") }),
      object({ kind: literal("Result"), index: pipe(number(), integer()) }),
      object({
        kind: literal("NestedResult"),
        index: pipe(number(), integer()),
        resultIndex: pipe(number(), integer())
      })
    ];
    TransactionArgument = union([...TransactionArgumentTypes]);
    MoveCallTransaction = object({
      kind: literal("MoveCall"),
      target: pipe(
        string(),
        check((target) => target.split("::").length === 3)
      ),
      typeArguments: array(string()),
      arguments: array(TransactionArgument)
    });
    TransferObjectsTransaction = object({
      kind: literal("TransferObjects"),
      objects: array(TransactionArgument),
      address: TransactionArgument
    });
    SplitCoinsTransaction = object({
      kind: literal("SplitCoins"),
      coin: TransactionArgument,
      amounts: array(TransactionArgument)
    });
    MergeCoinsTransaction = object({
      kind: literal("MergeCoins"),
      destination: TransactionArgument,
      sources: array(TransactionArgument)
    });
    MakeMoveVecTransaction = object({
      kind: literal("MakeMoveVec"),
      type: union([object({ Some: TypeTag2 }), object({ None: nullable(literal(true)) })]),
      objects: array(TransactionArgument)
    });
    PublishTransaction = object({
      kind: literal("Publish"),
      modules: array(array(pipe(number(), integer()))),
      dependencies: array(string())
    });
    UpgradeTransaction = object({
      kind: literal("Upgrade"),
      modules: array(array(pipe(number(), integer()))),
      dependencies: array(string()),
      packageId: string(),
      ticket: TransactionArgument
    });
    TransactionTypes = [
      MoveCallTransaction,
      TransferObjectsTransaction,
      SplitCoinsTransaction,
      MergeCoinsTransaction,
      PublishTransaction,
      UpgradeTransaction,
      MakeMoveVecTransaction
    ];
    TransactionType = union([...TransactionTypes]);
    SerializedTransactionDataV1 = object({
      version: literal(1),
      sender: optional(string()),
      expiration: nullish(TransactionExpiration3),
      gasConfig: GasConfig,
      inputs: array(TransactionInput),
      transactions: array(TransactionType)
    });
    __name(serializeV1TransactionData, "serializeV1TransactionData");
    __name(convertTransactionArgument, "convertTransactionArgument");
    __name(transactionDataFromV1, "transactionDataFromV1");
    __name(parseV1TransactionArgument, "parseV1TransactionArgument");
  }
});

// ../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/crypto.js
var crypto;
var init_crypto = __esm({
  "../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/crypto.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    crypto = typeof globalThis === "object" && "crypto" in globalThis ? globalThis.crypto : void 0;
  }
});

// ../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/utils.js
function isBytes2(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber2(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes(b, ...lengths) {
  if (!isBytes2(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new Error("Hash should be wrapped by utils.createHasher");
  anumber2(h.outputLen);
  anumber2(h.blockLen);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function u32(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function byteSwap(word) {
  return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
}
function byteSwap32(arr) {
  for (let i = 0; i < arr.length; i++) {
    arr[i] = byteSwap(arr[i]);
  }
  return arr;
}
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function asciiToBase16(ch) {
  if (ch >= asciis._0 && ch <= asciis._9)
    return ch - asciis._0;
  if (ch >= asciis.A && ch <= asciis.F)
    return ch - (asciis.A - 10);
  if (ch >= asciis.a && ch <= asciis.f)
    return ch - (asciis.a - 10);
  return;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  if (hasHexBuiltin)
    return Uint8Array.fromHex(hex);
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new Error("hex string expected, got unpadded hex of length " + hl);
  const array2 = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array2[ai] = n1 * 16 + n2;
  }
  return array2;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
function kdfInputToBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
function concatBytes(...arrays) {
  let sum = 0;
  for (let i = 0; i < arrays.length; i++) {
    const a = arrays[i];
    abytes(a);
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i = 0, pad = 0; i < arrays.length; i++) {
    const a = arrays[i];
    res.set(a, pad);
    pad += a.length;
  }
  return res;
}
function checkOpts(defaults, opts) {
  if (opts !== void 0 && {}.toString.call(opts) !== "[object Object]")
    throw new Error("options should be object or undefined");
  const merged = Object.assign(defaults, opts);
  return merged;
}
function createHasher(hashCons) {
  const hashC = /* @__PURE__ */ __name((msg) => hashCons().update(toBytes(msg)).digest(), "hashC");
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
function createOptHasher(hashCons) {
  const hashC = /* @__PURE__ */ __name((msg, opts) => hashCons(opts).update(toBytes(msg)).digest(), "hashC");
  const tmp = hashCons({});
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = (opts) => hashCons(opts);
  return hashC;
}
function randomBytes(bytesLength = 32) {
  if (crypto && typeof crypto.getRandomValues === "function") {
    return crypto.getRandomValues(new Uint8Array(bytesLength));
  }
  if (crypto && typeof crypto.randomBytes === "function") {
    return Uint8Array.from(crypto.randomBytes(bytesLength));
  }
  throw new Error("crypto.getRandomValues must be defined");
}
var isLE, swap8IfBE, swap32IfBE, hasHexBuiltin, hexes, asciis, Hash;
var init_utils3 = __esm({
  "../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/utils.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_crypto();
    __name(isBytes2, "isBytes");
    __name(anumber2, "anumber");
    __name(abytes, "abytes");
    __name(ahash, "ahash");
    __name(aexists, "aexists");
    __name(aoutput, "aoutput");
    __name(u32, "u32");
    __name(clean, "clean");
    __name(createView, "createView");
    isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
    __name(byteSwap, "byteSwap");
    swap8IfBE = isLE ? (n) => n : (n) => byteSwap(n);
    __name(byteSwap32, "byteSwap32");
    swap32IfBE = isLE ? (u) => u : byteSwap32;
    hasHexBuiltin = /* @__PURE__ */ (() => (
      // @ts-ignore
      typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
    ))();
    hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
    __name(bytesToHex, "bytesToHex");
    asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
    __name(asciiToBase16, "asciiToBase16");
    __name(hexToBytes, "hexToBytes");
    __name(utf8ToBytes, "utf8ToBytes");
    __name(toBytes, "toBytes");
    __name(kdfInputToBytes, "kdfInputToBytes");
    __name(concatBytes, "concatBytes");
    __name(checkOpts, "checkOpts");
    Hash = class {
      static {
        __name(this, "Hash");
      }
    };
    __name(createHasher, "createHasher");
    __name(createOptHasher, "createOptHasher");
    __name(randomBytes, "randomBytes");
  }
});

// ../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/_blake.js
var BSIGMA;
var init_blake = __esm({
  "../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/_blake.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    BSIGMA = /* @__PURE__ */ Uint8Array.from([
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      14,
      10,
      4,
      8,
      9,
      15,
      13,
      6,
      1,
      12,
      0,
      2,
      11,
      7,
      5,
      3,
      11,
      8,
      12,
      0,
      5,
      2,
      15,
      13,
      10,
      14,
      3,
      6,
      7,
      1,
      9,
      4,
      7,
      9,
      3,
      1,
      13,
      12,
      11,
      14,
      2,
      6,
      5,
      10,
      4,
      0,
      15,
      8,
      9,
      0,
      5,
      7,
      2,
      4,
      10,
      15,
      14,
      1,
      11,
      12,
      6,
      8,
      3,
      13,
      2,
      12,
      6,
      10,
      0,
      11,
      8,
      3,
      4,
      13,
      7,
      5,
      15,
      14,
      1,
      9,
      12,
      5,
      1,
      15,
      14,
      13,
      4,
      10,
      0,
      7,
      6,
      3,
      9,
      2,
      8,
      11,
      13,
      11,
      7,
      14,
      12,
      1,
      3,
      9,
      5,
      0,
      15,
      4,
      8,
      6,
      2,
      10,
      6,
      15,
      14,
      9,
      11,
      3,
      0,
      8,
      12,
      2,
      13,
      7,
      1,
      4,
      10,
      5,
      10,
      2,
      8,
      4,
      7,
      6,
      1,
      5,
      15,
      11,
      9,
      14,
      3,
      12,
      13,
      0,
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      14,
      10,
      4,
      8,
      9,
      15,
      13,
      6,
      1,
      12,
      0,
      2,
      11,
      7,
      5,
      3,
      // Blake1, unused in others
      11,
      8,
      12,
      0,
      5,
      2,
      15,
      13,
      10,
      14,
      3,
      6,
      7,
      1,
      9,
      4,
      7,
      9,
      3,
      1,
      13,
      12,
      11,
      14,
      2,
      6,
      5,
      10,
      4,
      0,
      15,
      8,
      9,
      0,
      5,
      7,
      2,
      4,
      10,
      15,
      14,
      1,
      11,
      12,
      6,
      8,
      3,
      13,
      2,
      12,
      6,
      10,
      0,
      11,
      8,
      3,
      4,
      13,
      7,
      5,
      15,
      14,
      1,
      9
    ]);
  }
});

// ../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/_md.js
function setBigUint64(view, byteOffset, value, isLE2) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE2);
  const _32n2 = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n2 & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE2 ? 4 : 0;
  const l = isLE2 ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE2);
  view.setUint32(byteOffset + l, wl, isLE2);
}
var HashMD, SHA512_IV;
var init_md = __esm({
  "../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/_md.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_utils3();
    __name(setBigUint64, "setBigUint64");
    HashMD = class extends Hash {
      static {
        __name(this, "HashMD");
      }
      constructor(blockLen, outputLen, padOffset, isLE2) {
        super();
        this.finished = false;
        this.length = 0;
        this.pos = 0;
        this.destroyed = false;
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.padOffset = padOffset;
        this.isLE = isLE2;
        this.buffer = new Uint8Array(blockLen);
        this.view = createView(this.buffer);
      }
      update(data) {
        aexists(this);
        data = toBytes(data);
        abytes(data);
        const { view, buffer, blockLen } = this;
        const len = data.length;
        for (let pos = 0; pos < len; ) {
          const take = Math.min(blockLen - this.pos, len - pos);
          if (take === blockLen) {
            const dataView = createView(data);
            for (; blockLen <= len - pos; pos += blockLen)
              this.process(dataView, pos);
            continue;
          }
          buffer.set(data.subarray(pos, pos + take), this.pos);
          this.pos += take;
          pos += take;
          if (this.pos === blockLen) {
            this.process(view, 0);
            this.pos = 0;
          }
        }
        this.length += data.length;
        this.roundClean();
        return this;
      }
      digestInto(out) {
        aexists(this);
        aoutput(out, this);
        this.finished = true;
        const { buffer, view, blockLen, isLE: isLE2 } = this;
        let { pos } = this;
        buffer[pos++] = 128;
        clean(this.buffer.subarray(pos));
        if (this.padOffset > blockLen - pos) {
          this.process(view, 0);
          pos = 0;
        }
        for (let i = pos; i < blockLen; i++)
          buffer[i] = 0;
        setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE2);
        this.process(view, 0);
        const oview = createView(out);
        const len = this.outputLen;
        if (len % 4)
          throw new Error("_sha2: outputLen should be aligned to 32bit");
        const outLen = len / 4;
        const state = this.get();
        if (outLen > state.length)
          throw new Error("_sha2: outputLen bigger than state");
        for (let i = 0; i < outLen; i++)
          oview.setUint32(4 * i, state[i], isLE2);
      }
      digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
      }
      _cloneInto(to) {
        to || (to = new this.constructor());
        to.set(...this.get());
        const { blockLen, buffer, length, finished, destroyed, pos } = this;
        to.destroyed = destroyed;
        to.finished = finished;
        to.length = length;
        to.pos = pos;
        if (length % blockLen)
          to.buffer.set(buffer);
        return to;
      }
      clone() {
        return this._cloneInto();
      }
    };
    SHA512_IV = /* @__PURE__ */ Uint32Array.from([
      1779033703,
      4089235720,
      3144134277,
      2227873595,
      1013904242,
      4271175723,
      2773480762,
      1595750129,
      1359893119,
      2917565137,
      2600822924,
      725511199,
      528734635,
      4215389547,
      1541459225,
      327033209
    ]);
  }
});

// ../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/_u64.js
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
function add(Ah, Al, Bh, Bl) {
  const l = (Al >>> 0) + (Bl >>> 0);
  return { h: Ah + Bh + (l / 2 ** 32 | 0) | 0, l: l | 0 };
}
var U32_MASK64, _32n, shrSH, shrSL, rotrSH, rotrSL, rotrBH, rotrBL, rotr32H, rotr32L, add3L, add3H, add4L, add4H, add5L, add5H;
var init_u64 = __esm({
  "../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/_u64.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
    _32n = /* @__PURE__ */ BigInt(32);
    __name(fromBig, "fromBig");
    __name(split, "split");
    shrSH = /* @__PURE__ */ __name((h, _l, s) => h >>> s, "shrSH");
    shrSL = /* @__PURE__ */ __name((h, l, s) => h << 32 - s | l >>> s, "shrSL");
    rotrSH = /* @__PURE__ */ __name((h, l, s) => h >>> s | l << 32 - s, "rotrSH");
    rotrSL = /* @__PURE__ */ __name((h, l, s) => h << 32 - s | l >>> s, "rotrSL");
    rotrBH = /* @__PURE__ */ __name((h, l, s) => h << 64 - s | l >>> s - 32, "rotrBH");
    rotrBL = /* @__PURE__ */ __name((h, l, s) => h >>> s - 32 | l << 64 - s, "rotrBL");
    rotr32H = /* @__PURE__ */ __name((_h, l) => l, "rotr32H");
    rotr32L = /* @__PURE__ */ __name((h, _l) => h, "rotr32L");
    __name(add, "add");
    add3L = /* @__PURE__ */ __name((Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0), "add3L");
    add3H = /* @__PURE__ */ __name((low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0, "add3H");
    add4L = /* @__PURE__ */ __name((Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0), "add4L");
    add4H = /* @__PURE__ */ __name((low, Ah, Bh, Ch, Dh) => Ah + Bh + Ch + Dh + (low / 2 ** 32 | 0) | 0, "add4H");
    add5L = /* @__PURE__ */ __name((Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0), "add5L");
    add5H = /* @__PURE__ */ __name((low, Ah, Bh, Ch, Dh, Eh) => Ah + Bh + Ch + Dh + Eh + (low / 2 ** 32 | 0) | 0, "add5H");
  }
});

// ../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/blake2.js
function G1b(a, b, c, d, msg, x) {
  const Xl = msg[x], Xh = msg[x + 1];
  let Al = BBUF[2 * a], Ah = BBUF[2 * a + 1];
  let Bl = BBUF[2 * b], Bh = BBUF[2 * b + 1];
  let Cl = BBUF[2 * c], Ch = BBUF[2 * c + 1];
  let Dl = BBUF[2 * d], Dh = BBUF[2 * d + 1];
  let ll = add3L(Al, Bl, Xl);
  Ah = add3H(ll, Ah, Bh, Xh);
  Al = ll | 0;
  ({ Dh, Dl } = { Dh: Dh ^ Ah, Dl: Dl ^ Al });
  ({ Dh, Dl } = { Dh: rotr32H(Dh, Dl), Dl: rotr32L(Dh, Dl) });
  ({ h: Ch, l: Cl } = add(Ch, Cl, Dh, Dl));
  ({ Bh, Bl } = { Bh: Bh ^ Ch, Bl: Bl ^ Cl });
  ({ Bh, Bl } = { Bh: rotrSH(Bh, Bl, 24), Bl: rotrSL(Bh, Bl, 24) });
  BBUF[2 * a] = Al, BBUF[2 * a + 1] = Ah;
  BBUF[2 * b] = Bl, BBUF[2 * b + 1] = Bh;
  BBUF[2 * c] = Cl, BBUF[2 * c + 1] = Ch;
  BBUF[2 * d] = Dl, BBUF[2 * d + 1] = Dh;
}
function G2b(a, b, c, d, msg, x) {
  const Xl = msg[x], Xh = msg[x + 1];
  let Al = BBUF[2 * a], Ah = BBUF[2 * a + 1];
  let Bl = BBUF[2 * b], Bh = BBUF[2 * b + 1];
  let Cl = BBUF[2 * c], Ch = BBUF[2 * c + 1];
  let Dl = BBUF[2 * d], Dh = BBUF[2 * d + 1];
  let ll = add3L(Al, Bl, Xl);
  Ah = add3H(ll, Ah, Bh, Xh);
  Al = ll | 0;
  ({ Dh, Dl } = { Dh: Dh ^ Ah, Dl: Dl ^ Al });
  ({ Dh, Dl } = { Dh: rotrSH(Dh, Dl, 16), Dl: rotrSL(Dh, Dl, 16) });
  ({ h: Ch, l: Cl } = add(Ch, Cl, Dh, Dl));
  ({ Bh, Bl } = { Bh: Bh ^ Ch, Bl: Bl ^ Cl });
  ({ Bh, Bl } = { Bh: rotrBH(Bh, Bl, 63), Bl: rotrBL(Bh, Bl, 63) });
  BBUF[2 * a] = Al, BBUF[2 * a + 1] = Ah;
  BBUF[2 * b] = Bl, BBUF[2 * b + 1] = Bh;
  BBUF[2 * c] = Cl, BBUF[2 * c + 1] = Ch;
  BBUF[2 * d] = Dl, BBUF[2 * d + 1] = Dh;
}
function checkBlake2Opts(outputLen, opts = {}, keyLen, saltLen, persLen) {
  anumber2(keyLen);
  if (outputLen < 0 || outputLen > keyLen)
    throw new Error("outputLen bigger than keyLen");
  const { key, salt, personalization } = opts;
  if (key !== void 0 && (key.length < 1 || key.length > keyLen))
    throw new Error("key length must be undefined or 1.." + keyLen);
  if (salt !== void 0 && salt.length !== saltLen)
    throw new Error("salt must be undefined or " + saltLen);
  if (personalization !== void 0 && personalization.length !== persLen)
    throw new Error("personalization must be undefined or " + persLen);
}
var B2B_IV, BBUF, BLAKE2, BLAKE2b, blake2b;
var init_blake2 = __esm({
  "../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/blake2.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_blake();
    init_u64();
    init_utils3();
    B2B_IV = /* @__PURE__ */ Uint32Array.from([
      4089235720,
      1779033703,
      2227873595,
      3144134277,
      4271175723,
      1013904242,
      1595750129,
      2773480762,
      2917565137,
      1359893119,
      725511199,
      2600822924,
      4215389547,
      528734635,
      327033209,
      1541459225
    ]);
    BBUF = /* @__PURE__ */ new Uint32Array(32);
    __name(G1b, "G1b");
    __name(G2b, "G2b");
    __name(checkBlake2Opts, "checkBlake2Opts");
    BLAKE2 = class extends Hash {
      static {
        __name(this, "BLAKE2");
      }
      constructor(blockLen, outputLen) {
        super();
        this.finished = false;
        this.destroyed = false;
        this.length = 0;
        this.pos = 0;
        anumber2(blockLen);
        anumber2(outputLen);
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.buffer = new Uint8Array(blockLen);
        this.buffer32 = u32(this.buffer);
      }
      update(data) {
        aexists(this);
        data = toBytes(data);
        abytes(data);
        const { blockLen, buffer, buffer32 } = this;
        const len = data.length;
        const offset = data.byteOffset;
        const buf = data.buffer;
        for (let pos = 0; pos < len; ) {
          if (this.pos === blockLen) {
            swap32IfBE(buffer32);
            this.compress(buffer32, 0, false);
            swap32IfBE(buffer32);
            this.pos = 0;
          }
          const take = Math.min(blockLen - this.pos, len - pos);
          const dataOffset = offset + pos;
          if (take === blockLen && !(dataOffset % 4) && pos + take < len) {
            const data32 = new Uint32Array(buf, dataOffset, Math.floor((len - pos) / 4));
            swap32IfBE(data32);
            for (let pos32 = 0; pos + blockLen < len; pos32 += buffer32.length, pos += blockLen) {
              this.length += blockLen;
              this.compress(data32, pos32, false);
            }
            swap32IfBE(data32);
            continue;
          }
          buffer.set(data.subarray(pos, pos + take), this.pos);
          this.pos += take;
          this.length += take;
          pos += take;
        }
        return this;
      }
      digestInto(out) {
        aexists(this);
        aoutput(out, this);
        const { pos, buffer32 } = this;
        this.finished = true;
        clean(this.buffer.subarray(pos));
        swap32IfBE(buffer32);
        this.compress(buffer32, 0, true);
        swap32IfBE(buffer32);
        const out32 = u32(out);
        this.get().forEach((v, i) => out32[i] = swap8IfBE(v));
      }
      digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
      }
      _cloneInto(to) {
        const { buffer, length, finished, destroyed, outputLen, pos } = this;
        to || (to = new this.constructor({ dkLen: outputLen }));
        to.set(...this.get());
        to.buffer.set(buffer);
        to.destroyed = destroyed;
        to.finished = finished;
        to.length = length;
        to.pos = pos;
        to.outputLen = outputLen;
        return to;
      }
      clone() {
        return this._cloneInto();
      }
    };
    BLAKE2b = class extends BLAKE2 {
      static {
        __name(this, "BLAKE2b");
      }
      constructor(opts = {}) {
        const olen = opts.dkLen === void 0 ? 64 : opts.dkLen;
        super(128, olen);
        this.v0l = B2B_IV[0] | 0;
        this.v0h = B2B_IV[1] | 0;
        this.v1l = B2B_IV[2] | 0;
        this.v1h = B2B_IV[3] | 0;
        this.v2l = B2B_IV[4] | 0;
        this.v2h = B2B_IV[5] | 0;
        this.v3l = B2B_IV[6] | 0;
        this.v3h = B2B_IV[7] | 0;
        this.v4l = B2B_IV[8] | 0;
        this.v4h = B2B_IV[9] | 0;
        this.v5l = B2B_IV[10] | 0;
        this.v5h = B2B_IV[11] | 0;
        this.v6l = B2B_IV[12] | 0;
        this.v6h = B2B_IV[13] | 0;
        this.v7l = B2B_IV[14] | 0;
        this.v7h = B2B_IV[15] | 0;
        checkBlake2Opts(olen, opts, 64, 16, 16);
        let { key, personalization, salt } = opts;
        let keyLength = 0;
        if (key !== void 0) {
          key = toBytes(key);
          keyLength = key.length;
        }
        this.v0l ^= this.outputLen | keyLength << 8 | 1 << 16 | 1 << 24;
        if (salt !== void 0) {
          salt = toBytes(salt);
          const slt = u32(salt);
          this.v4l ^= swap8IfBE(slt[0]);
          this.v4h ^= swap8IfBE(slt[1]);
          this.v5l ^= swap8IfBE(slt[2]);
          this.v5h ^= swap8IfBE(slt[3]);
        }
        if (personalization !== void 0) {
          personalization = toBytes(personalization);
          const pers = u32(personalization);
          this.v6l ^= swap8IfBE(pers[0]);
          this.v6h ^= swap8IfBE(pers[1]);
          this.v7l ^= swap8IfBE(pers[2]);
          this.v7h ^= swap8IfBE(pers[3]);
        }
        if (key !== void 0) {
          const tmp = new Uint8Array(this.blockLen);
          tmp.set(key);
          this.update(tmp);
        }
      }
      // prettier-ignore
      get() {
        let { v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h } = this;
        return [v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h];
      }
      // prettier-ignore
      set(v0l, v0h, v1l, v1h, v2l, v2h, v3l, v3h, v4l, v4h, v5l, v5h, v6l, v6h, v7l, v7h) {
        this.v0l = v0l | 0;
        this.v0h = v0h | 0;
        this.v1l = v1l | 0;
        this.v1h = v1h | 0;
        this.v2l = v2l | 0;
        this.v2h = v2h | 0;
        this.v3l = v3l | 0;
        this.v3h = v3h | 0;
        this.v4l = v4l | 0;
        this.v4h = v4h | 0;
        this.v5l = v5l | 0;
        this.v5h = v5h | 0;
        this.v6l = v6l | 0;
        this.v6h = v6h | 0;
        this.v7l = v7l | 0;
        this.v7h = v7h | 0;
      }
      compress(msg, offset, isLast) {
        this.get().forEach((v, i) => BBUF[i] = v);
        BBUF.set(B2B_IV, 16);
        let { h, l } = fromBig(BigInt(this.length));
        BBUF[24] = B2B_IV[8] ^ l;
        BBUF[25] = B2B_IV[9] ^ h;
        if (isLast) {
          BBUF[28] = ~BBUF[28];
          BBUF[29] = ~BBUF[29];
        }
        let j = 0;
        const s = BSIGMA;
        for (let i = 0; i < 12; i++) {
          G1b(0, 4, 8, 12, msg, offset + 2 * s[j++]);
          G2b(0, 4, 8, 12, msg, offset + 2 * s[j++]);
          G1b(1, 5, 9, 13, msg, offset + 2 * s[j++]);
          G2b(1, 5, 9, 13, msg, offset + 2 * s[j++]);
          G1b(2, 6, 10, 14, msg, offset + 2 * s[j++]);
          G2b(2, 6, 10, 14, msg, offset + 2 * s[j++]);
          G1b(3, 7, 11, 15, msg, offset + 2 * s[j++]);
          G2b(3, 7, 11, 15, msg, offset + 2 * s[j++]);
          G1b(0, 5, 10, 15, msg, offset + 2 * s[j++]);
          G2b(0, 5, 10, 15, msg, offset + 2 * s[j++]);
          G1b(1, 6, 11, 12, msg, offset + 2 * s[j++]);
          G2b(1, 6, 11, 12, msg, offset + 2 * s[j++]);
          G1b(2, 7, 8, 13, msg, offset + 2 * s[j++]);
          G2b(2, 7, 8, 13, msg, offset + 2 * s[j++]);
          G1b(3, 4, 9, 14, msg, offset + 2 * s[j++]);
          G2b(3, 4, 9, 14, msg, offset + 2 * s[j++]);
        }
        this.v0l ^= BBUF[0] ^ BBUF[16];
        this.v0h ^= BBUF[1] ^ BBUF[17];
        this.v1l ^= BBUF[2] ^ BBUF[18];
        this.v1h ^= BBUF[3] ^ BBUF[19];
        this.v2l ^= BBUF[4] ^ BBUF[20];
        this.v2h ^= BBUF[5] ^ BBUF[21];
        this.v3l ^= BBUF[6] ^ BBUF[22];
        this.v3h ^= BBUF[7] ^ BBUF[23];
        this.v4l ^= BBUF[8] ^ BBUF[24];
        this.v4h ^= BBUF[9] ^ BBUF[25];
        this.v5l ^= BBUF[10] ^ BBUF[26];
        this.v5h ^= BBUF[11] ^ BBUF[27];
        this.v6l ^= BBUF[12] ^ BBUF[28];
        this.v6h ^= BBUF[13] ^ BBUF[29];
        this.v7l ^= BBUF[14] ^ BBUF[30];
        this.v7h ^= BBUF[15] ^ BBUF[31];
        clean(BBUF);
      }
      destroy() {
        this.destroyed = true;
        clean(this.buffer32);
        this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      }
    };
    blake2b = /* @__PURE__ */ createOptHasher((opts) => new BLAKE2b(opts));
  }
});

// ../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/blake2b.js
var blake2b2;
var init_blake2b = __esm({
  "../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/blake2b.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_blake2();
    blake2b2 = blake2b;
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/utils/dynamic-fields.js
function deriveDynamicFieldID(parentId, typeTag, key) {
  const address = suiBcs.Address.serialize(parentId).toBytes();
  const tag = suiBcs.TypeTag.serialize(typeTag).toBytes();
  const keyLength = suiBcs.u64().serialize(key.length).toBytes();
  const hash = blake2b2.create({
    dkLen: 32
  });
  hash.update(new Uint8Array([240]));
  hash.update(address);
  hash.update(keyLength);
  hash.update(key);
  hash.update(tag);
  return `0x${toHex(hash.digest().slice(0, 32))}`;
}
var init_dynamic_fields = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/utils/dynamic-fields.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm3();
    init_blake2b();
    init_bcs3();
    __name(deriveDynamicFieldID, "deriveDynamicFieldID");
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/hash.js
function hashTypedData(typeTag, data) {
  const typeTagBytes = Array.from(`${typeTag}::`).map((e) => e.charCodeAt(0));
  const dataWithTag = new Uint8Array(typeTagBytes.length + data.length);
  dataWithTag.set(typeTagBytes);
  dataWithTag.set(data, typeTagBytes.length);
  return blake2b2(dataWithTag, { dkLen: 32 });
}
var init_hash = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/hash.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_blake2b();
    __name(hashTypedData, "hashTypedData");
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/utils.js
function getIdFromCallArg(arg) {
  if (typeof arg === "string") {
    return normalizeSuiAddress(arg);
  }
  if (arg.Object) {
    if (arg.Object.ImmOrOwnedObject) {
      return normalizeSuiAddress(arg.Object.ImmOrOwnedObject.objectId);
    }
    if (arg.Object.Receiving) {
      return normalizeSuiAddress(arg.Object.Receiving.objectId);
    }
    return normalizeSuiAddress(arg.Object.SharedObject.objectId);
  }
  if (arg.UnresolvedObject) {
    return normalizeSuiAddress(arg.UnresolvedObject.objectId);
  }
  return void 0;
}
function remapCommandArguments(command, inputMapping, commandMapping) {
  const remapArg = /* @__PURE__ */ __name((arg) => {
    switch (arg.$kind) {
      case "Input": {
        const newInputIndex = inputMapping.get(arg.Input);
        if (newInputIndex === void 0) {
          throw new Error(`Input ${arg.Input} not found in input mapping`);
        }
        return { ...arg, Input: newInputIndex };
      }
      case "Result": {
        const newCommandIndex = commandMapping.get(arg.Result);
        if (newCommandIndex !== void 0) {
          return { ...arg, Result: newCommandIndex };
        }
        return arg;
      }
      case "NestedResult": {
        const newCommandIndex = commandMapping.get(arg.NestedResult[0]);
        if (newCommandIndex !== void 0) {
          return { ...arg, NestedResult: [newCommandIndex, arg.NestedResult[1]] };
        }
        return arg;
      }
      default:
        return arg;
    }
  }, "remapArg");
  switch (command.$kind) {
    case "MoveCall":
      command.MoveCall.arguments = command.MoveCall.arguments.map(remapArg);
      break;
    case "TransferObjects":
      command.TransferObjects.objects = command.TransferObjects.objects.map(remapArg);
      command.TransferObjects.address = remapArg(command.TransferObjects.address);
      break;
    case "SplitCoins":
      command.SplitCoins.coin = remapArg(command.SplitCoins.coin);
      command.SplitCoins.amounts = command.SplitCoins.amounts.map(remapArg);
      break;
    case "MergeCoins":
      command.MergeCoins.destination = remapArg(command.MergeCoins.destination);
      command.MergeCoins.sources = command.MergeCoins.sources.map(remapArg);
      break;
    case "MakeMoveVec":
      command.MakeMoveVec.elements = command.MakeMoveVec.elements.map(remapArg);
      break;
    case "Upgrade":
      command.Upgrade.ticket = remapArg(command.Upgrade.ticket);
      break;
    case "$Intent": {
      const inputs = command.$Intent.inputs;
      command.$Intent.inputs = {};
      for (const [key, value] of Object.entries(inputs)) {
        command.$Intent.inputs[key] = Array.isArray(value) ? value.map(remapArg) : remapArg(value);
      }
      break;
    }
    case "Publish":
      break;
  }
}
var init_utils4 = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/utils.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_sui_types();
    __name(getIdFromCallArg, "getIdFromCallArg");
    __name(remapCommandArguments, "remapCommandArguments");
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/TransactionData.js
function prepareSuiAddress(address) {
  return normalizeSuiAddress(address).replace("0x", "");
}
var TransactionDataBuilder;
var init_TransactionData = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/TransactionData.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm3();
    init_dist();
    init_bcs3();
    init_sui_types();
    init_internal();
    init_v1();
    init_hash();
    init_utils4();
    __name(prepareSuiAddress, "prepareSuiAddress");
    TransactionDataBuilder = class _TransactionDataBuilder {
      static {
        __name(this, "TransactionDataBuilder");
      }
      constructor(clone) {
        this.version = 2;
        this.sender = clone?.sender ?? null;
        this.expiration = clone?.expiration ?? null;
        this.inputs = clone?.inputs ?? [];
        this.commands = clone?.commands ?? [];
        this.gasData = clone?.gasData ?? {
          budget: null,
          price: null,
          owner: null,
          payment: null
        };
      }
      static fromKindBytes(bytes) {
        const kind = suiBcs.TransactionKind.parse(bytes);
        const programmableTx = kind.ProgrammableTransaction;
        if (!programmableTx) {
          throw new Error("Unable to deserialize from bytes.");
        }
        return _TransactionDataBuilder.restore({
          version: 2,
          sender: null,
          expiration: null,
          gasData: {
            budget: null,
            owner: null,
            payment: null,
            price: null
          },
          inputs: programmableTx.inputs,
          commands: programmableTx.commands
        });
      }
      static fromBytes(bytes) {
        const rawData = suiBcs.TransactionData.parse(bytes);
        const data = rawData?.V1;
        const programmableTx = data.kind.ProgrammableTransaction;
        if (!data || !programmableTx) {
          throw new Error("Unable to deserialize from bytes.");
        }
        return _TransactionDataBuilder.restore({
          version: 2,
          sender: data.sender,
          expiration: data.expiration,
          gasData: data.gasData,
          inputs: programmableTx.inputs,
          commands: programmableTx.commands
        });
      }
      static restore(data) {
        if (data.version === 2) {
          return new _TransactionDataBuilder(parse(TransactionDataSchema, data));
        } else {
          return new _TransactionDataBuilder(parse(TransactionDataSchema, transactionDataFromV1(data)));
        }
      }
      /**
       * Generate transaction digest.
       *
       * @param bytes BCS serialized transaction data
       * @returns transaction digest.
       */
      static getDigestFromBytes(bytes) {
        const hash = hashTypedData("TransactionData", bytes);
        return toBase58(hash);
      }
      // @deprecated use gasData instead
      get gasConfig() {
        return this.gasData;
      }
      // @deprecated use gasData instead
      set gasConfig(value) {
        this.gasData = value;
      }
      build({
        maxSizeBytes = Infinity,
        overrides,
        onlyTransactionKind
      } = {}) {
        const inputs = this.inputs;
        const commands = this.commands;
        const kind = {
          ProgrammableTransaction: {
            inputs,
            commands
          }
        };
        if (onlyTransactionKind) {
          return suiBcs.TransactionKind.serialize(kind, { maxSize: maxSizeBytes }).toBytes();
        }
        const expiration = overrides?.expiration ?? this.expiration;
        const sender = overrides?.sender ?? this.sender;
        const gasData = { ...this.gasData, ...overrides?.gasConfig, ...overrides?.gasData };
        if (!sender) {
          throw new Error("Missing transaction sender");
        }
        if (!gasData.budget) {
          throw new Error("Missing gas budget");
        }
        if (!gasData.payment) {
          throw new Error("Missing gas payment");
        }
        if (!gasData.price) {
          throw new Error("Missing gas price");
        }
        const transactionData = {
          sender: prepareSuiAddress(sender),
          expiration: expiration ? expiration : { None: true },
          gasData: {
            payment: gasData.payment,
            owner: prepareSuiAddress(this.gasData.owner ?? sender),
            price: BigInt(gasData.price),
            budget: BigInt(gasData.budget)
          },
          kind: {
            ProgrammableTransaction: {
              inputs,
              commands
            }
          }
        };
        return suiBcs.TransactionData.serialize(
          { V1: transactionData },
          { maxSize: maxSizeBytes }
        ).toBytes();
      }
      addInput(type, arg) {
        const index = this.inputs.length;
        this.inputs.push(arg);
        return { Input: index, type, $kind: "Input" };
      }
      getInputUses(index, fn) {
        this.mapArguments((arg, command) => {
          if (arg.$kind === "Input" && arg.Input === index) {
            fn(arg, command);
          }
          return arg;
        });
      }
      mapCommandArguments(index, fn) {
        const command = this.commands[index];
        switch (command.$kind) {
          case "MoveCall":
            command.MoveCall.arguments = command.MoveCall.arguments.map(
              (arg) => fn(arg, command, index)
            );
            break;
          case "TransferObjects":
            command.TransferObjects.objects = command.TransferObjects.objects.map(
              (arg) => fn(arg, command, index)
            );
            command.TransferObjects.address = fn(command.TransferObjects.address, command, index);
            break;
          case "SplitCoins":
            command.SplitCoins.coin = fn(command.SplitCoins.coin, command, index);
            command.SplitCoins.amounts = command.SplitCoins.amounts.map(
              (arg) => fn(arg, command, index)
            );
            break;
          case "MergeCoins":
            command.MergeCoins.destination = fn(command.MergeCoins.destination, command, index);
            command.MergeCoins.sources = command.MergeCoins.sources.map(
              (arg) => fn(arg, command, index)
            );
            break;
          case "MakeMoveVec":
            command.MakeMoveVec.elements = command.MakeMoveVec.elements.map(
              (arg) => fn(arg, command, index)
            );
            break;
          case "Upgrade":
            command.Upgrade.ticket = fn(command.Upgrade.ticket, command, index);
            break;
          case "$Intent":
            const inputs = command.$Intent.inputs;
            command.$Intent.inputs = {};
            for (const [key, value] of Object.entries(inputs)) {
              command.$Intent.inputs[key] = Array.isArray(value) ? value.map((arg) => fn(arg, command, index)) : fn(value, command, index);
            }
            break;
          case "Publish":
            break;
          default:
            throw new Error(`Unexpected transaction kind: ${command.$kind}`);
        }
      }
      mapArguments(fn) {
        for (const commandIndex of this.commands.keys()) {
          this.mapCommandArguments(commandIndex, fn);
        }
      }
      replaceCommand(index, replacement, resultIndex = index) {
        if (!Array.isArray(replacement)) {
          this.commands[index] = replacement;
          return;
        }
        const sizeDiff = replacement.length - 1;
        this.commands.splice(index, 1, ...structuredClone(replacement));
        this.mapArguments((arg, _command, commandIndex) => {
          if (commandIndex < index + replacement.length) {
            return arg;
          }
          if (typeof resultIndex !== "number") {
            if (arg.$kind === "Result" && arg.Result === index || arg.$kind === "NestedResult" && arg.NestedResult[0] === index) {
              if (!("NestedResult" in arg) || arg.NestedResult[1] === 0) {
                return parse(ArgumentSchema, structuredClone(resultIndex));
              } else {
                throw new Error(
                  `Cannot replace command ${index} with a specific result type: NestedResult[${index}, ${arg.NestedResult[1]}] references a nested element that cannot be mapped to the replacement result`
                );
              }
            }
          }
          switch (arg.$kind) {
            case "Result":
              if (arg.Result === index && typeof resultIndex === "number") {
                arg.Result = resultIndex;
              }
              if (arg.Result > index) {
                arg.Result += sizeDiff;
              }
              break;
            case "NestedResult":
              if (arg.NestedResult[0] === index && typeof resultIndex === "number") {
                return {
                  $kind: "NestedResult",
                  NestedResult: [resultIndex, arg.NestedResult[1]]
                };
              }
              if (arg.NestedResult[0] > index) {
                arg.NestedResult[0] += sizeDiff;
              }
              break;
          }
          return arg;
        });
      }
      replaceCommandWithTransaction(index, otherTransaction, result) {
        if (result.$kind !== "Result" && result.$kind !== "NestedResult") {
          throw new Error("Result must be of kind Result or NestedResult");
        }
        this.insertTransaction(index, otherTransaction);
        this.replaceCommand(
          index + otherTransaction.commands.length,
          [],
          "Result" in result ? { NestedResult: [result.Result + index, 0] } : {
            NestedResult: [
              result.NestedResult[0] + index,
              result.NestedResult[1]
            ]
          }
        );
      }
      insertTransaction(atCommandIndex, otherTransaction) {
        const inputMapping = /* @__PURE__ */ new Map();
        const commandMapping = /* @__PURE__ */ new Map();
        for (let i = 0; i < otherTransaction.inputs.length; i++) {
          const otherInput = otherTransaction.inputs[i];
          const id = getIdFromCallArg(otherInput);
          let existingIndex = -1;
          if (id !== void 0) {
            existingIndex = this.inputs.findIndex((input) => getIdFromCallArg(input) === id);
            if (existingIndex !== -1 && this.inputs[existingIndex].Object?.SharedObject && otherInput.Object?.SharedObject) {
              this.inputs[existingIndex].Object.SharedObject.mutable = this.inputs[existingIndex].Object.SharedObject.mutable || otherInput.Object.SharedObject.mutable;
            }
          }
          if (existingIndex !== -1) {
            inputMapping.set(i, existingIndex);
          } else {
            const newIndex = this.inputs.length;
            this.inputs.push(otherInput);
            inputMapping.set(i, newIndex);
          }
        }
        for (let i = 0; i < otherTransaction.commands.length; i++) {
          commandMapping.set(i, atCommandIndex + i);
        }
        const remappedCommands = [];
        for (let i = 0; i < otherTransaction.commands.length; i++) {
          const command = structuredClone(otherTransaction.commands[i]);
          remapCommandArguments(command, inputMapping, commandMapping);
          remappedCommands.push(command);
        }
        this.commands.splice(atCommandIndex, 0, ...remappedCommands);
        const sizeDiff = remappedCommands.length;
        if (sizeDiff > 0) {
          this.mapArguments((arg, _command, commandIndex) => {
            if (commandIndex >= atCommandIndex && commandIndex < atCommandIndex + remappedCommands.length) {
              return arg;
            }
            switch (arg.$kind) {
              case "Result":
                if (arg.Result >= atCommandIndex) {
                  arg.Result += sizeDiff;
                }
                break;
              case "NestedResult":
                if (arg.NestedResult[0] >= atCommandIndex) {
                  arg.NestedResult[0] += sizeDiff;
                }
                break;
            }
            return arg;
          });
        }
      }
      getDigest() {
        const bytes = this.build({ onlyTransactionKind: false });
        return _TransactionDataBuilder.getDigestFromBytes(bytes);
      }
      snapshot() {
        return parse(TransactionDataSchema, this);
      }
      shallowClone() {
        return new _TransactionDataBuilder({
          version: this.version,
          sender: this.sender,
          expiration: this.expiration,
          gasData: {
            ...this.gasData
          },
          inputs: [...this.inputs],
          commands: [...this.commands]
        });
      }
      applyResolvedData(resolved) {
        if (!this.sender) {
          this.sender = resolved.sender ?? null;
        }
        if (!this.expiration) {
          this.expiration = resolved.expiration ?? null;
        }
        if (!this.gasData.budget) {
          this.gasData.budget = resolved.gasData.budget;
        }
        if (!this.gasData.owner) {
          this.gasData.owner = resolved.gasData.owner ?? null;
        }
        if (!this.gasData.payment) {
          this.gasData.payment = resolved.gasData.payment;
        }
        if (!this.gasData.price) {
          this.gasData.price = resolved.gasData.price;
        }
        for (let i = 0; i < this.inputs.length; i++) {
          const input = this.inputs[i];
          const resolvedInput = resolved.inputs[i];
          switch (input.$kind) {
            case "UnresolvedPure":
              if (resolvedInput.$kind !== "Pure") {
                throw new Error(
                  `Expected input at index ${i} to resolve to a Pure argument, but got ${JSON.stringify(
                    resolvedInput
                  )}`
                );
              }
              this.inputs[i] = resolvedInput;
              break;
            case "UnresolvedObject":
              if (resolvedInput.$kind !== "Object") {
                throw new Error(
                  `Expected input at index ${i} to resolve to an Object argument, but got ${JSON.stringify(
                    resolvedInput
                  )}`
                );
              }
              if (resolvedInput.Object.$kind === "ImmOrOwnedObject" || resolvedInput.Object.$kind === "Receiving") {
                const original = input.UnresolvedObject;
                const resolved2 = resolvedInput.Object.ImmOrOwnedObject ?? resolvedInput.Object.Receiving;
                if (normalizeSuiAddress(original.objectId) !== normalizeSuiAddress(resolved2.objectId) || original.version != null && original.version !== resolved2.version || original.digest != null && original.digest !== resolved2.digest || // Objects with shared object properties should not resolve to owned objects
                original.mutable != null || original.initialSharedVersion != null) {
                  throw new Error(
                    `Input at index ${i} did not match unresolved object. ${JSON.stringify(original)} is not compatible with ${JSON.stringify(resolved2)}`
                  );
                }
              } else if (resolvedInput.Object.$kind === "SharedObject") {
                const original = input.UnresolvedObject;
                const resolved2 = resolvedInput.Object.SharedObject;
                if (normalizeSuiAddress(original.objectId) !== normalizeSuiAddress(resolved2.objectId) || original.initialSharedVersion != null && original.initialSharedVersion !== resolved2.initialSharedVersion || original.mutable != null && original.mutable !== resolved2.mutable || // Objects with owned object properties should not resolve to shared objects
                original.version != null || original.digest != null) {
                  throw new Error(
                    `Input at index ${i} did not match unresolved object. ${JSON.stringify(original)} is not compatible with ${JSON.stringify(resolved2)}`
                  );
                }
              } else {
                throw new Error(
                  `Input at index ${i} resolved to an unexpected Object kind: ${JSON.stringify(
                    resolvedInput.Object
                  )}`
                );
              }
              this.inputs[i] = resolvedInput;
              break;
          }
        }
      }
    };
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/experimental/mvr.js
function validateOverrides(overrides) {
  if (overrides?.packages) {
    for (const [pkg, id] of Object.entries(overrides.packages)) {
      if (!isValidNamedPackage(pkg)) {
        throw new Error(`Invalid package name: ${pkg}`);
      }
      if (!isValidSuiAddress(normalizeSuiAddress(id))) {
        throw new Error(`Invalid package ID: ${id}`);
      }
    }
  }
  if (overrides?.types) {
    for (const [type, val] of Object.entries(overrides.types)) {
      if (parseStructTag(type).typeParams.length > 0) {
        throw new Error(
          "Type overrides must be first-level only. If you want to supply generic types, just pass each type individually."
        );
      }
      const parsedValue = parseStructTag(val);
      if (!isValidSuiAddress(parsedValue.address)) {
        throw new Error(`Invalid type: ${val}`);
      }
    }
  }
}
function extractMvrTypes(type, types = /* @__PURE__ */ new Set()) {
  if (typeof type === "string" && !hasMvrName(type)) return types;
  const tag = isStructTag(type) ? type : parseStructTag(type);
  if (hasMvrName(tag.address)) types.add(`${tag.address}::${tag.module}::${tag.name}`);
  for (const param of tag.typeParams) {
    extractMvrTypes(param, types);
  }
  return types;
}
function replaceMvrNames(tag, typeCache) {
  const type = isStructTag(tag) ? tag : parseStructTag(tag);
  const typeTag = `${type.address}::${type.module}::${type.name}`;
  const cacheHit = typeCache[typeTag];
  return normalizeStructTag({
    ...type,
    address: cacheHit ? cacheHit.split("::")[0] : type.address,
    typeParams: type.typeParams.map((param) => replaceMvrNames(param, typeCache))
  });
}
function hasMvrName(nameOrType) {
  return nameOrType.includes(NAME_SEPARATOR2) || nameOrType.includes("@") || nameOrType.includes(".sui");
}
function isStructTag(type) {
  return typeof type === "object" && "address" in type && "module" in type && "name" in type && "typeParams" in type;
}
function findNamesInTransaction(builder) {
  const packages = /* @__PURE__ */ new Set();
  const types = /* @__PURE__ */ new Set();
  for (const command of builder.commands) {
    switch (command.$kind) {
      case "MakeMoveVec":
        if (command.MakeMoveVec.type) {
          getNamesFromTypeList([command.MakeMoveVec.type]).forEach((type) => {
            types.add(type);
          });
        }
        break;
      case "MoveCall":
        const moveCall = command.MoveCall;
        const pkg = moveCall.package.split("::")[0];
        if (hasMvrName(pkg)) {
          if (!isValidNamedPackage(pkg)) throw new Error(`Invalid package name: ${pkg}`);
          packages.add(pkg);
        }
        getNamesFromTypeList(moveCall.typeArguments ?? []).forEach((type) => {
          types.add(type);
        });
        break;
      default:
        break;
    }
  }
  return {
    packages: [...packages],
    types: [...types]
  };
}
function replaceNames(builder, resolved) {
  for (const command of builder.commands) {
    if (command.MakeMoveVec?.type) {
      if (!hasMvrName(command.MakeMoveVec.type)) continue;
      if (!resolved.types[command.MakeMoveVec.type])
        throw new Error(`No resolution found for type: ${command.MakeMoveVec.type}`);
      command.MakeMoveVec.type = resolved.types[command.MakeMoveVec.type].type;
    }
    const tx = command.MoveCall;
    if (!tx) continue;
    const nameParts = tx.package.split("::");
    const name = nameParts[0];
    if (hasMvrName(name) && !resolved.packages[name])
      throw new Error(`No address found for package: ${name}`);
    if (hasMvrName(name)) {
      nameParts[0] = resolved.packages[name].package;
      tx.package = nameParts.join("::");
    }
    const types = tx.typeArguments;
    if (!types) continue;
    for (let i = 0; i < types.length; i++) {
      if (!hasMvrName(types[i])) continue;
      if (!resolved.types[types[i]]) throw new Error(`No resolution found for type: ${types[i]}`);
      types[i] = resolved.types[types[i]].type;
    }
    tx.typeArguments = types;
  }
}
function getNamesFromTypeList(types) {
  const names = /* @__PURE__ */ new Set();
  for (const type of types) {
    if (hasMvrName(type)) {
      if (!isValidNamedType(type)) throw new Error(`Invalid type with names: ${type}`);
      names.add(type);
    }
  }
  return names;
}
var __typeError5, __accessCheck5, __privateGet5, __privateAdd5, __privateSet5, __privateMethod3, _cache2, _url, _pageSize, _overrides, _MvrClient_instances, mvrPackageDataLoader_get, mvrTypeDataLoader_get, resolvePackages_fn, resolveTypes_fn, fetch_fn, NAME_SEPARATOR2, MVR_API_HEADER, MvrClient;
var init_mvr = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/experimental/mvr.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm2();
    init_move_registry();
    init_sui_types();
    init_version();
    __typeError5 = /* @__PURE__ */ __name((msg) => {
      throw TypeError(msg);
    }, "__typeError");
    __accessCheck5 = /* @__PURE__ */ __name((obj, member, msg) => member.has(obj) || __typeError5("Cannot " + msg), "__accessCheck");
    __privateGet5 = /* @__PURE__ */ __name((obj, member, getter) => (__accessCheck5(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj)), "__privateGet");
    __privateAdd5 = /* @__PURE__ */ __name((obj, member, value) => member.has(obj) ? __typeError5("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value), "__privateAdd");
    __privateSet5 = /* @__PURE__ */ __name((obj, member, value, setter) => (__accessCheck5(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value), "__privateSet");
    __privateMethod3 = /* @__PURE__ */ __name((obj, member, method) => (__accessCheck5(obj, member, "access private method"), method), "__privateMethod");
    NAME_SEPARATOR2 = "/";
    MVR_API_HEADER = {
      "Mvr-Source": `@mysten/sui@${PACKAGE_VERSION}`
    };
    MvrClient = class {
      static {
        __name(this, "MvrClient");
      }
      constructor({ cache, url, pageSize = 50, overrides }) {
        __privateAdd5(this, _MvrClient_instances);
        __privateAdd5(this, _cache2);
        __privateAdd5(this, _url);
        __privateAdd5(this, _pageSize);
        __privateAdd5(this, _overrides);
        __privateSet5(this, _cache2, cache);
        __privateSet5(this, _url, url);
        __privateSet5(this, _pageSize, pageSize);
        __privateSet5(this, _overrides, {
          packages: overrides?.packages,
          types: overrides?.types
        });
        validateOverrides(__privateGet5(this, _overrides));
      }
      async resolvePackage({
        package: name
      }) {
        if (!hasMvrName(name)) {
          return {
            package: name
          };
        }
        const resolved = await __privateGet5(this, _MvrClient_instances, mvrPackageDataLoader_get).load(name);
        return {
          package: resolved
        };
      }
      async resolveType({
        type
      }) {
        if (!hasMvrName(type)) {
          return {
            type
          };
        }
        const mvrTypes = [...extractMvrTypes(type)];
        const resolvedTypes = await __privateGet5(this, _MvrClient_instances, mvrTypeDataLoader_get).loadMany(mvrTypes);
        const typeMap = {};
        for (let i = 0; i < mvrTypes.length; i++) {
          const resolvedType = resolvedTypes[i];
          if (resolvedType instanceof Error) {
            throw resolvedType;
          }
          typeMap[mvrTypes[i]] = resolvedType;
        }
        return {
          type: replaceMvrNames(type, typeMap)
        };
      }
      async resolve({
        types = [],
        packages = []
      }) {
        const mvrTypes = /* @__PURE__ */ new Set();
        for (const type of types ?? []) {
          extractMvrTypes(type, mvrTypes);
        }
        const typesArray = [...mvrTypes];
        const [resolvedTypes, resolvedPackages] = await Promise.all([
          typesArray.length > 0 ? __privateGet5(this, _MvrClient_instances, mvrTypeDataLoader_get).loadMany(typesArray) : [],
          packages.length > 0 ? __privateGet5(this, _MvrClient_instances, mvrPackageDataLoader_get).loadMany(packages) : []
        ]);
        const typeMap = {
          ...__privateGet5(this, _overrides)?.types
        };
        for (const [i, type] of typesArray.entries()) {
          const resolvedType = resolvedTypes[i];
          if (resolvedType instanceof Error) {
            throw resolvedType;
          }
          typeMap[type] = resolvedType;
        }
        const replacedTypes = {};
        for (const type of types ?? []) {
          const resolvedType = replaceMvrNames(type, typeMap);
          replacedTypes[type] = {
            type: resolvedType
          };
        }
        const replacedPackages = {};
        for (const [i, pkg] of (packages ?? []).entries()) {
          const resolvedPkg = __privateGet5(this, _overrides)?.packages?.[pkg] ?? resolvedPackages[i];
          if (resolvedPkg instanceof Error) {
            throw resolvedPkg;
          }
          replacedPackages[pkg] = {
            package: resolvedPkg
          };
        }
        return {
          types: replacedTypes,
          packages: replacedPackages
        };
      }
    };
    _cache2 = /* @__PURE__ */ new WeakMap();
    _url = /* @__PURE__ */ new WeakMap();
    _pageSize = /* @__PURE__ */ new WeakMap();
    _overrides = /* @__PURE__ */ new WeakMap();
    _MvrClient_instances = /* @__PURE__ */ new WeakSet();
    mvrPackageDataLoader_get = /* @__PURE__ */ __name(function() {
      return __privateGet5(this, _cache2).readSync(["#mvrPackageDataLoader", __privateGet5(this, _url) ?? ""], () => {
        const loader = new DataLoader(async (packages) => {
          if (!__privateGet5(this, _url)) {
            throw new Error(
              `MVR Api URL is not set for the current client (resolving ${packages.join(", ")})`
            );
          }
          const resolved = await __privateMethod3(this, _MvrClient_instances, resolvePackages_fn).call(this, packages);
          return packages.map(
            (pkg) => resolved[pkg] ?? new Error(`Failed to resolve package: ${pkg}`)
          );
        });
        const overrides = __privateGet5(this, _overrides)?.packages;
        if (overrides) {
          for (const [pkg, id] of Object.entries(overrides)) {
            loader.prime(pkg, id);
          }
        }
        return loader;
      });
    }, "mvrPackageDataLoader_get");
    mvrTypeDataLoader_get = /* @__PURE__ */ __name(function() {
      return __privateGet5(this, _cache2).readSync(["#mvrTypeDataLoader", __privateGet5(this, _url) ?? ""], () => {
        const loader = new DataLoader(async (types) => {
          if (!__privateGet5(this, _url)) {
            throw new Error(
              `MVR Api URL is not set for the current client (resolving ${types.join(", ")})`
            );
          }
          const resolved = await __privateMethod3(this, _MvrClient_instances, resolveTypes_fn).call(this, types);
          return types.map((type) => resolved[type] ?? new Error(`Failed to resolve type: ${type}`));
        });
        const overrides = __privateGet5(this, _overrides)?.types;
        if (overrides) {
          for (const [type, id] of Object.entries(overrides)) {
            loader.prime(type, id);
          }
        }
        return loader;
      });
    }, "mvrTypeDataLoader_get");
    resolvePackages_fn = /* @__PURE__ */ __name(async function(packages) {
      if (packages.length === 0) return {};
      const batches = chunk(packages, __privateGet5(this, _pageSize));
      const results = {};
      await Promise.all(
        batches.map(async (batch) => {
          const data = await __privateMethod3(this, _MvrClient_instances, fetch_fn).call(this, "/v1/resolution/bulk", {
            names: batch
          });
          if (!data?.resolution) return;
          for (const pkg of Object.keys(data?.resolution)) {
            const pkgData = data.resolution[pkg]?.package_id;
            if (!pkgData) continue;
            results[pkg] = pkgData;
          }
        })
      );
      return results;
    }, "resolvePackages_fn");
    resolveTypes_fn = /* @__PURE__ */ __name(async function(types) {
      if (types.length === 0) return {};
      const batches = chunk(types, __privateGet5(this, _pageSize));
      const results = {};
      await Promise.all(
        batches.map(async (batch) => {
          const data = await __privateMethod3(this, _MvrClient_instances, fetch_fn).call(this, "/v1/struct-definition/bulk", {
            types: batch
          });
          if (!data?.resolution) return;
          for (const type of Object.keys(data?.resolution)) {
            const typeData = data.resolution[type]?.type_tag;
            if (!typeData) continue;
            results[type] = typeData;
          }
        })
      );
      return results;
    }, "resolveTypes_fn");
    fetch_fn = /* @__PURE__ */ __name(async function(url, body) {
      if (!__privateGet5(this, _url)) {
        throw new Error("MVR Api URL is not set for the current client");
      }
      const response = await fetch(`${__privateGet5(this, _url)}${url}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...MVR_API_HEADER
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(`Failed to resolve types: ${errorBody?.message}`);
      }
      return response.json();
    }, "fetch_fn");
    __name(validateOverrides, "validateOverrides");
    __name(extractMvrTypes, "extractMvrTypes");
    __name(replaceMvrNames, "replaceMvrNames");
    __name(hasMvrName, "hasMvrName");
    __name(isStructTag, "isStructTag");
    __name(findNamesInTransaction, "findNamesInTransaction");
    __name(replaceNames, "replaceNames");
    __name(getNamesFromTypeList, "getNamesFromTypeList");
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/experimental/core.js
var DEFAULT_MVR_URLS, Experimental_CoreClient;
var init_core = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/experimental/core.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_type_tag_serializer();
    init_dynamic_fields();
    init_sui_types();
    init_client();
    init_mvr();
    DEFAULT_MVR_URLS = {
      mainnet: "https://mainnet.mvr.mystenlabs.com",
      testnet: "https://testnet.mvr.mystenlabs.com"
    };
    Experimental_CoreClient = class extends Experimental_BaseClient {
      static {
        __name(this, "Experimental_CoreClient");
      }
      constructor(options) {
        super(options);
        this.core = this;
        this.mvr = new MvrClient({
          cache: this.cache.scope("core.mvr"),
          url: options.mvr?.url ?? DEFAULT_MVR_URLS[this.network],
          pageSize: options.mvr?.pageSize,
          overrides: options.mvr?.overrides
        });
      }
      async getObject(options) {
        const { objectId } = options;
        const {
          objects: [result]
        } = await this.getObjects({ objectIds: [objectId], signal: options.signal });
        if (result instanceof Error) {
          throw result;
        }
        return { object: result };
      }
      async getDynamicField(options) {
        const normalizedNameType = TypeTagSerializer.parseFromStr(
          (await this.core.mvr.resolveType({
            type: options.name.type
          })).type
        );
        const fieldId = deriveDynamicFieldID(options.parentId, normalizedNameType, options.name.bcs);
        const {
          objects: [fieldObject]
        } = await this.getObjects({
          objectIds: [fieldId],
          signal: options.signal
        });
        if (fieldObject instanceof Error) {
          throw fieldObject;
        }
        const fieldType = parseStructTag(fieldObject.type);
        const content = await fieldObject.content;
        return {
          dynamicField: {
            id: fieldObject.id,
            digest: fieldObject.digest,
            version: fieldObject.version,
            type: fieldObject.type,
            previousTransaction: fieldObject.previousTransaction,
            name: {
              type: typeof fieldType.typeParams[0] === "string" ? fieldType.typeParams[0] : normalizeStructTag(fieldType.typeParams[0]),
              bcs: options.name.bcs
            },
            value: {
              type: typeof fieldType.typeParams[1] === "string" ? fieldType.typeParams[1] : normalizeStructTag(fieldType.typeParams[1]),
              bcs: content.slice(SUI_ADDRESS_LENGTH + options.name.bcs.length)
            }
          }
        };
      }
      async waitForTransaction({
        signal,
        timeout = 60 * 1e3,
        ...input
      }) {
        const abortSignal = signal ? AbortSignal.any([AbortSignal.timeout(timeout), signal]) : AbortSignal.timeout(timeout);
        const abortPromise = new Promise((_, reject) => {
          abortSignal.addEventListener("abort", () => reject(abortSignal.reason));
        });
        abortPromise.catch(() => {
        });
        while (true) {
          abortSignal.throwIfAborted();
          try {
            return await this.getTransaction({
              ...input,
              signal: abortSignal
            });
          } catch {
            await Promise.race([new Promise((resolve) => setTimeout(resolve, 2e3)), abortPromise]);
          }
        }
      }
    };
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/experimental/errors.js
var SuiClientError, ObjectError;
var init_errors = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/experimental/errors.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    SuiClientError = class extends Error {
      static {
        __name(this, "SuiClientError");
      }
    };
    ObjectError = class _ObjectError extends SuiClientError {
      static {
        __name(this, "ObjectError");
      }
      constructor(code, message) {
        super(message);
        this.code = code;
      }
      static fromResponse(response, objectId) {
        switch (response.code) {
          case "notExists":
            return new _ObjectError(response.code, `Object ${response.object_id} does not exist`);
          case "dynamicFieldNotFound":
            return new _ObjectError(
              response.code,
              `Dynamic field not found for object ${response.parent_object_id}`
            );
          case "deleted":
            return new _ObjectError(response.code, `Object ${response.object_id} has been deleted`);
          case "displayError":
            return new _ObjectError(response.code, `Display error: ${response.error}`);
          case "unknown":
          default:
            return new _ObjectError(
              response.code,
              `Unknown error while loading object${objectId ? ` ${objectId}` : ""}`
            );
        }
      }
    };
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/experimental/transports/utils.js
function parseTransactionBcs(bytes) {
  return {
    ...TransactionDataBuilder.fromBytes(bytes).snapshot(),
    bcs: bytes
  };
}
function parseTransactionEffectsBcs(effects) {
  const parsed = suiBcs.TransactionEffects.parse(effects);
  switch (parsed.$kind) {
    case "V1":
      return parseTransactionEffectsV1({ bytes: effects, effects: parsed.V1 });
    case "V2":
      return parseTransactionEffectsV2({ bytes: effects, effects: parsed.V2 });
    default:
      throw new Error(
        `Unknown transaction effects version: ${parsed.$kind}`
      );
  }
}
function parseTransactionEffectsV1(_) {
  throw new Error("V1 effects are not supported yet");
}
function parseTransactionEffectsV2({
  bytes,
  effects
}) {
  const changedObjects = effects.changedObjects.map(
    ([id, change]) => {
      return {
        id,
        inputState: change.inputState.$kind === "Exist" ? "Exists" : "DoesNotExist",
        inputVersion: change.inputState.Exist?.[0][0] ?? null,
        inputDigest: change.inputState.Exist?.[0][1] ?? null,
        inputOwner: change.inputState.Exist?.[1] ?? null,
        outputState: change.outputState.$kind === "NotExist" ? "DoesNotExist" : change.outputState.$kind,
        outputVersion: change.outputState.$kind === "PackageWrite" ? change.outputState.PackageWrite?.[0] : change.outputState.ObjectWrite ? effects.lamportVersion : null,
        outputDigest: change.outputState.$kind === "PackageWrite" ? change.outputState.PackageWrite?.[1] : change.outputState.ObjectWrite?.[0] ?? null,
        outputOwner: change.outputState.ObjectWrite ? change.outputState.ObjectWrite[1] : null,
        idOperation: change.idOperation.$kind
      };
    }
  );
  return {
    bcs: bytes,
    digest: effects.transactionDigest,
    version: 2,
    status: effects.status.$kind === "Success" ? {
      success: true,
      error: null
    } : {
      success: false,
      // TODO: add command
      error: effects.status.Failed.error.$kind
    },
    gasUsed: effects.gasUsed,
    transactionDigest: effects.transactionDigest,
    gasObject: effects.gasObjectIndex === null ? null : changedObjects[effects.gasObjectIndex] ?? null,
    eventsDigest: effects.eventsDigest,
    dependencies: effects.dependencies,
    lamportVersion: effects.lamportVersion,
    changedObjects,
    unchangedConsensusObjects: effects.unchangedSharedObjects.map(
      ([objectId, object2]) => {
        return {
          kind: object2.$kind === "MutateDeleted" ? "MutateConsensusStreamEnded" : object2.$kind === "ReadDeleted" ? "ReadConsensusStreamEnded" : object2.$kind,
          objectId,
          version: object2.$kind === "ReadOnlyRoot" ? object2.ReadOnlyRoot[0] : object2[object2.$kind],
          digest: object2.$kind === "ReadOnlyRoot" ? object2.ReadOnlyRoot[1] : null
        };
      }
    ),
    auxiliaryDataDigest: effects.auxDataDigest
  };
}
var init_utils5 = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/experimental/transports/utils.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_bcs3();
    init_TransactionData();
    __name(parseTransactionBcs, "parseTransactionBcs");
    __name(parseTransactionEffectsBcs, "parseTransactionEffectsBcs");
    __name(parseTransactionEffectsV1, "parseTransactionEffectsV1");
    __name(parseTransactionEffectsV2, "parseTransactionEffectsV2");
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/experimental/index.js
var init_experimental = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/experimental/index.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_utils5();
  }
});

// ../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/sha2.js
var K512, SHA512_Kh, SHA512_Kl, SHA512_W_H, SHA512_W_L, SHA512, sha512;
var init_sha2 = __esm({
  "../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/sha2.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_md();
    init_u64();
    init_utils3();
    K512 = /* @__PURE__ */ (() => split([
      "0x428a2f98d728ae22",
      "0x7137449123ef65cd",
      "0xb5c0fbcfec4d3b2f",
      "0xe9b5dba58189dbbc",
      "0x3956c25bf348b538",
      "0x59f111f1b605d019",
      "0x923f82a4af194f9b",
      "0xab1c5ed5da6d8118",
      "0xd807aa98a3030242",
      "0x12835b0145706fbe",
      "0x243185be4ee4b28c",
      "0x550c7dc3d5ffb4e2",
      "0x72be5d74f27b896f",
      "0x80deb1fe3b1696b1",
      "0x9bdc06a725c71235",
      "0xc19bf174cf692694",
      "0xe49b69c19ef14ad2",
      "0xefbe4786384f25e3",
      "0x0fc19dc68b8cd5b5",
      "0x240ca1cc77ac9c65",
      "0x2de92c6f592b0275",
      "0x4a7484aa6ea6e483",
      "0x5cb0a9dcbd41fbd4",
      "0x76f988da831153b5",
      "0x983e5152ee66dfab",
      "0xa831c66d2db43210",
      "0xb00327c898fb213f",
      "0xbf597fc7beef0ee4",
      "0xc6e00bf33da88fc2",
      "0xd5a79147930aa725",
      "0x06ca6351e003826f",
      "0x142929670a0e6e70",
      "0x27b70a8546d22ffc",
      "0x2e1b21385c26c926",
      "0x4d2c6dfc5ac42aed",
      "0x53380d139d95b3df",
      "0x650a73548baf63de",
      "0x766a0abb3c77b2a8",
      "0x81c2c92e47edaee6",
      "0x92722c851482353b",
      "0xa2bfe8a14cf10364",
      "0xa81a664bbc423001",
      "0xc24b8b70d0f89791",
      "0xc76c51a30654be30",
      "0xd192e819d6ef5218",
      "0xd69906245565a910",
      "0xf40e35855771202a",
      "0x106aa07032bbd1b8",
      "0x19a4c116b8d2d0c8",
      "0x1e376c085141ab53",
      "0x2748774cdf8eeb99",
      "0x34b0bcb5e19b48a8",
      "0x391c0cb3c5c95a63",
      "0x4ed8aa4ae3418acb",
      "0x5b9cca4f7763e373",
      "0x682e6ff3d6b2b8a3",
      "0x748f82ee5defb2fc",
      "0x78a5636f43172f60",
      "0x84c87814a1f0ab72",
      "0x8cc702081a6439ec",
      "0x90befffa23631e28",
      "0xa4506cebde82bde9",
      "0xbef9a3f7b2c67915",
      "0xc67178f2e372532b",
      "0xca273eceea26619c",
      "0xd186b8c721c0c207",
      "0xeada7dd6cde0eb1e",
      "0xf57d4f7fee6ed178",
      "0x06f067aa72176fba",
      "0x0a637dc5a2c898a6",
      "0x113f9804bef90dae",
      "0x1b710b35131c471b",
      "0x28db77f523047d84",
      "0x32caab7b40c72493",
      "0x3c9ebe0a15c9bebc",
      "0x431d67c49c100d4c",
      "0x4cc5d4becb3e42b6",
      "0x597f299cfc657e2a",
      "0x5fcb6fab3ad6faec",
      "0x6c44198c4a475817"
    ].map((n) => BigInt(n))))();
    SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
    SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
    SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
    SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
    SHA512 = class extends HashMD {
      static {
        __name(this, "SHA512");
      }
      constructor(outputLen = 64) {
        super(128, outputLen, 16, false);
        this.Ah = SHA512_IV[0] | 0;
        this.Al = SHA512_IV[1] | 0;
        this.Bh = SHA512_IV[2] | 0;
        this.Bl = SHA512_IV[3] | 0;
        this.Ch = SHA512_IV[4] | 0;
        this.Cl = SHA512_IV[5] | 0;
        this.Dh = SHA512_IV[6] | 0;
        this.Dl = SHA512_IV[7] | 0;
        this.Eh = SHA512_IV[8] | 0;
        this.El = SHA512_IV[9] | 0;
        this.Fh = SHA512_IV[10] | 0;
        this.Fl = SHA512_IV[11] | 0;
        this.Gh = SHA512_IV[12] | 0;
        this.Gl = SHA512_IV[13] | 0;
        this.Hh = SHA512_IV[14] | 0;
        this.Hl = SHA512_IV[15] | 0;
      }
      // prettier-ignore
      get() {
        const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
      }
      // prettier-ignore
      set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
        this.Ah = Ah | 0;
        this.Al = Al | 0;
        this.Bh = Bh | 0;
        this.Bl = Bl | 0;
        this.Ch = Ch | 0;
        this.Cl = Cl | 0;
        this.Dh = Dh | 0;
        this.Dl = Dl | 0;
        this.Eh = Eh | 0;
        this.El = El | 0;
        this.Fh = Fh | 0;
        this.Fl = Fl | 0;
        this.Gh = Gh | 0;
        this.Gl = Gl | 0;
        this.Hh = Hh | 0;
        this.Hl = Hl | 0;
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4) {
          SHA512_W_H[i] = view.getUint32(offset);
          SHA512_W_L[i] = view.getUint32(offset += 4);
        }
        for (let i = 16; i < 80; i++) {
          const W15h = SHA512_W_H[i - 15] | 0;
          const W15l = SHA512_W_L[i - 15] | 0;
          const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
          const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
          const W2h = SHA512_W_H[i - 2] | 0;
          const W2l = SHA512_W_L[i - 2] | 0;
          const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
          const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
          const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
          const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
          SHA512_W_H[i] = SUMh | 0;
          SHA512_W_L[i] = SUMl | 0;
        }
        let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        for (let i = 0; i < 80; i++) {
          const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
          const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
          const CHIh = Eh & Fh ^ ~Eh & Gh;
          const CHIl = El & Fl ^ ~El & Gl;
          const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
          const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
          const T1l = T1ll | 0;
          const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
          const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
          const MAJh = Ah & Bh ^ Ah & Ch ^ Bh & Ch;
          const MAJl = Al & Bl ^ Al & Cl ^ Bl & Cl;
          Hh = Gh | 0;
          Hl = Gl | 0;
          Gh = Fh | 0;
          Gl = Fl | 0;
          Fh = Eh | 0;
          Fl = El | 0;
          ({ h: Eh, l: El } = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
          Dh = Ch | 0;
          Dl = Cl | 0;
          Ch = Bh | 0;
          Cl = Bl | 0;
          Bh = Ah | 0;
          Bl = Al | 0;
          const All = add3L(T1l, sigma0l, MAJl);
          Ah = add3H(All, T1h, sigma0h, MAJh);
          Al = All | 0;
        }
        ({ h: Ah, l: Al } = add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
        ({ h: Bh, l: Bl } = add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
        ({ h: Ch, l: Cl } = add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
        ({ h: Dh, l: Dl } = add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
        ({ h: Eh, l: El } = add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
        ({ h: Fh, l: Fl } = add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
        ({ h: Gh, l: Gl } = add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
        ({ h: Hh, l: Hl } = add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
        this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
      }
      roundClean() {
        clean(SHA512_W_H, SHA512_W_L);
      }
      destroy() {
        clean(this.buffer);
        this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      }
    };
    sha512 = /* @__PURE__ */ createHasher(() => new SHA512());
  }
});

// ../../node_modules/.pnpm/@noble+curves@1.9.4/node_modules/@noble/curves/esm/utils.js
function abool(title2, value) {
  if (typeof value !== "boolean")
    throw new Error(title2 + " boolean expected, got " + value);
}
function hexToNumber(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  return hex === "" ? _0n : BigInt("0x" + hex);
}
function bytesToNumberBE(bytes) {
  return hexToNumber(bytesToHex(bytes));
}
function bytesToNumberLE(bytes) {
  abytes(bytes);
  return hexToNumber(bytesToHex(Uint8Array.from(bytes).reverse()));
}
function numberToBytesBE(n, len) {
  return hexToBytes(n.toString(16).padStart(len * 2, "0"));
}
function numberToBytesLE(n, len) {
  return numberToBytesBE(n, len).reverse();
}
function ensureBytes(title2, hex, expectedLength) {
  let res;
  if (typeof hex === "string") {
    try {
      res = hexToBytes(hex);
    } catch (e) {
      throw new Error(title2 + " must be hex string or Uint8Array, cause: " + e);
    }
  } else if (isBytes2(hex)) {
    res = Uint8Array.from(hex);
  } else {
    throw new Error(title2 + " must be hex string or Uint8Array");
  }
  const len = res.length;
  if (typeof expectedLength === "number" && len !== expectedLength)
    throw new Error(title2 + " of length " + expectedLength + " expected, got " + len);
  return res;
}
function equalBytes(a, b) {
  if (a.length !== b.length)
    return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++)
    diff |= a[i] ^ b[i];
  return diff === 0;
}
function inRange(n, min, max) {
  return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
}
function aInRange(title2, n, min, max) {
  if (!inRange(n, min, max))
    throw new Error("expected valid " + title2 + ": " + min + " <= n < " + max + ", got " + n);
}
function bitLen(n) {
  let len;
  for (len = 0; n > _0n; n >>= _1n, len += 1)
    ;
  return len;
}
function _validateObject(object2, fields, optFields = {}) {
  if (!object2 || typeof object2 !== "object")
    throw new Error("expected valid options object");
  function checkField(fieldName, expectedType, isOpt) {
    const val = object2[fieldName];
    if (isOpt && val === void 0)
      return;
    const current = typeof val;
    if (current !== expectedType || val === null)
      throw new Error(`param "${fieldName}" is invalid: expected ${expectedType}, got ${current}`);
  }
  __name(checkField, "checkField");
  Object.entries(fields).forEach(([k, v]) => checkField(k, v, false));
  Object.entries(optFields).forEach(([k, v]) => checkField(k, v, true));
}
function memoized(fn) {
  const map2 = /* @__PURE__ */ new WeakMap();
  return (arg, ...args) => {
    const val = map2.get(arg);
    if (val !== void 0)
      return val;
    const computed = fn(arg, ...args);
    map2.set(arg, computed);
    return computed;
  };
}
var _0n, _1n, isPosBig, bitMask;
var init_utils6 = __esm({
  "../../node_modules/.pnpm/@noble+curves@1.9.4/node_modules/@noble/curves/esm/utils.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_utils3();
    init_utils3();
    _0n = /* @__PURE__ */ BigInt(0);
    _1n = /* @__PURE__ */ BigInt(1);
    __name(abool, "abool");
    __name(hexToNumber, "hexToNumber");
    __name(bytesToNumberBE, "bytesToNumberBE");
    __name(bytesToNumberLE, "bytesToNumberLE");
    __name(numberToBytesBE, "numberToBytesBE");
    __name(numberToBytesLE, "numberToBytesLE");
    __name(ensureBytes, "ensureBytes");
    __name(equalBytes, "equalBytes");
    isPosBig = /* @__PURE__ */ __name((n) => typeof n === "bigint" && _0n <= n, "isPosBig");
    __name(inRange, "inRange");
    __name(aInRange, "aInRange");
    __name(bitLen, "bitLen");
    bitMask = /* @__PURE__ */ __name((n) => (_1n << BigInt(n)) - _1n, "bitMask");
    __name(_validateObject, "_validateObject");
    __name(memoized, "memoized");
  }
});

// ../../node_modules/.pnpm/@noble+curves@1.9.4/node_modules/@noble/curves/esm/abstract/modular.js
function mod(a, b) {
  const result = a % b;
  return result >= _0n2 ? result : b + result;
}
function pow2(x, power, modulo) {
  let res = x;
  while (power-- > _0n2) {
    res *= res;
    res %= modulo;
  }
  return res;
}
function invert(number2, modulo) {
  if (number2 === _0n2)
    throw new Error("invert: expected non-zero number");
  if (modulo <= _0n2)
    throw new Error("invert: expected positive modulus, got " + modulo);
  let a = mod(number2, modulo);
  let b = modulo;
  let x = _0n2, y = _1n2, u = _1n2, v = _0n2;
  while (a !== _0n2) {
    const q = b / a;
    const r = b % a;
    const m = x - u * q;
    const n = y - v * q;
    b = a, a = r, x = u, y = v, u = m, v = n;
  }
  const gcd2 = b;
  if (gcd2 !== _1n2)
    throw new Error("invert: does not exist");
  return mod(x, modulo);
}
function assertIsSquare(Fp2, root, n) {
  if (!Fp2.eql(Fp2.sqr(root), n))
    throw new Error("Cannot find square root");
}
function sqrt3mod4(Fp2, n) {
  const p1div4 = (Fp2.ORDER + _1n2) / _4n;
  const root = Fp2.pow(n, p1div4);
  assertIsSquare(Fp2, root, n);
  return root;
}
function sqrt5mod8(Fp2, n) {
  const p5div8 = (Fp2.ORDER - _5n) / _8n;
  const n2 = Fp2.mul(n, _2n);
  const v = Fp2.pow(n2, p5div8);
  const nv = Fp2.mul(n, v);
  const i = Fp2.mul(Fp2.mul(nv, _2n), v);
  const root = Fp2.mul(nv, Fp2.sub(i, Fp2.ONE));
  assertIsSquare(Fp2, root, n);
  return root;
}
function sqrt9mod16(P) {
  const Fp_ = Field(P);
  const tn = tonelliShanks(P);
  const c1 = tn(Fp_, Fp_.neg(Fp_.ONE));
  const c2 = tn(Fp_, c1);
  const c3 = tn(Fp_, Fp_.neg(c1));
  const c4 = (P + _7n) / _16n;
  return (Fp2, n) => {
    let tv1 = Fp2.pow(n, c4);
    let tv2 = Fp2.mul(tv1, c1);
    const tv3 = Fp2.mul(tv1, c2);
    const tv4 = Fp2.mul(tv1, c3);
    const e1 = Fp2.eql(Fp2.sqr(tv2), n);
    const e2 = Fp2.eql(Fp2.sqr(tv3), n);
    tv1 = Fp2.cmov(tv1, tv2, e1);
    tv2 = Fp2.cmov(tv4, tv3, e2);
    const e3 = Fp2.eql(Fp2.sqr(tv2), n);
    const root = Fp2.cmov(tv1, tv2, e3);
    assertIsSquare(Fp2, root, n);
    return root;
  };
}
function tonelliShanks(P) {
  if (P < _3n)
    throw new Error("sqrt is not defined for small field");
  let Q = P - _1n2;
  let S = 0;
  while (Q % _2n === _0n2) {
    Q /= _2n;
    S++;
  }
  let Z = _2n;
  const _Fp = Field(P);
  while (FpLegendre(_Fp, Z) === 1) {
    if (Z++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  }
  if (S === 1)
    return sqrt3mod4;
  let cc = _Fp.pow(Z, Q);
  const Q1div2 = (Q + _1n2) / _2n;
  return /* @__PURE__ */ __name(function tonelliSlow(Fp2, n) {
    if (Fp2.is0(n))
      return n;
    if (FpLegendre(Fp2, n) !== 1)
      throw new Error("Cannot find square root");
    let M = S;
    let c = Fp2.mul(Fp2.ONE, cc);
    let t = Fp2.pow(n, Q);
    let R = Fp2.pow(n, Q1div2);
    while (!Fp2.eql(t, Fp2.ONE)) {
      if (Fp2.is0(t))
        return Fp2.ZERO;
      let i = 1;
      let t_tmp = Fp2.sqr(t);
      while (!Fp2.eql(t_tmp, Fp2.ONE)) {
        i++;
        t_tmp = Fp2.sqr(t_tmp);
        if (i === M)
          throw new Error("Cannot find square root");
      }
      const exponent = _1n2 << BigInt(M - i - 1);
      const b = Fp2.pow(c, exponent);
      M = i;
      c = Fp2.sqr(b);
      t = Fp2.mul(t, c);
      R = Fp2.mul(R, b);
    }
    return R;
  }, "tonelliSlow");
}
function FpSqrt(P) {
  if (P % _4n === _3n)
    return sqrt3mod4;
  if (P % _8n === _5n)
    return sqrt5mod8;
  if (P % _16n === _9n)
    return sqrt9mod16(P);
  return tonelliShanks(P);
}
function validateField(field) {
  const initial = {
    ORDER: "bigint",
    MASK: "bigint",
    BYTES: "number",
    BITS: "number"
  };
  const opts = FIELD_FIELDS.reduce((map2, val) => {
    map2[val] = "function";
    return map2;
  }, initial);
  _validateObject(field, opts);
  return field;
}
function FpPow(Fp2, num, power) {
  if (power < _0n2)
    throw new Error("invalid exponent, negatives unsupported");
  if (power === _0n2)
    return Fp2.ONE;
  if (power === _1n2)
    return num;
  let p = Fp2.ONE;
  let d = num;
  while (power > _0n2) {
    if (power & _1n2)
      p = Fp2.mul(p, d);
    d = Fp2.sqr(d);
    power >>= _1n2;
  }
  return p;
}
function FpInvertBatch(Fp2, nums, passZero = false) {
  const inverted = new Array(nums.length).fill(passZero ? Fp2.ZERO : void 0);
  const multipliedAcc = nums.reduce((acc, num, i) => {
    if (Fp2.is0(num))
      return acc;
    inverted[i] = acc;
    return Fp2.mul(acc, num);
  }, Fp2.ONE);
  const invertedAcc = Fp2.inv(multipliedAcc);
  nums.reduceRight((acc, num, i) => {
    if (Fp2.is0(num))
      return acc;
    inverted[i] = Fp2.mul(acc, inverted[i]);
    return Fp2.mul(acc, num);
  }, invertedAcc);
  return inverted;
}
function FpLegendre(Fp2, n) {
  const p1mod2 = (Fp2.ORDER - _1n2) / _2n;
  const powered = Fp2.pow(n, p1mod2);
  const yes = Fp2.eql(powered, Fp2.ONE);
  const zero = Fp2.eql(powered, Fp2.ZERO);
  const no = Fp2.eql(powered, Fp2.neg(Fp2.ONE));
  if (!yes && !zero && !no)
    throw new Error("invalid Legendre symbol result");
  return yes ? 1 : zero ? 0 : -1;
}
function nLength(n, nBitLength) {
  if (nBitLength !== void 0)
    anumber2(nBitLength);
  const _nBitLength = nBitLength !== void 0 ? nBitLength : n.toString(2).length;
  const nByteLength = Math.ceil(_nBitLength / 8);
  return { nBitLength: _nBitLength, nByteLength };
}
function Field(ORDER, bitLenOrOpts, isLE2 = false, opts = {}) {
  if (ORDER <= _0n2)
    throw new Error("invalid field: expected ORDER > 0, got " + ORDER);
  let _nbitLength = void 0;
  let _sqrt = void 0;
  let modOnDecode = false;
  let allowedLengths = void 0;
  if (typeof bitLenOrOpts === "object" && bitLenOrOpts != null) {
    if (opts.sqrt || isLE2)
      throw new Error("cannot specify opts in two arguments");
    const _opts = bitLenOrOpts;
    if (_opts.BITS)
      _nbitLength = _opts.BITS;
    if (_opts.sqrt)
      _sqrt = _opts.sqrt;
    if (typeof _opts.isLE === "boolean")
      isLE2 = _opts.isLE;
    if (typeof _opts.modOnDecode === "boolean")
      modOnDecode = _opts.modOnDecode;
    allowedLengths = _opts.allowedLengths;
  } else {
    if (typeof bitLenOrOpts === "number")
      _nbitLength = bitLenOrOpts;
    if (opts.sqrt)
      _sqrt = opts.sqrt;
  }
  const { nBitLength: BITS, nByteLength: BYTES } = nLength(ORDER, _nbitLength);
  if (BYTES > 2048)
    throw new Error("invalid field: expected ORDER of <= 2048 bytes");
  let sqrtP;
  const f = Object.freeze({
    ORDER,
    isLE: isLE2,
    BITS,
    BYTES,
    MASK: bitMask(BITS),
    ZERO: _0n2,
    ONE: _1n2,
    allowedLengths,
    create: /* @__PURE__ */ __name((num) => mod(num, ORDER), "create"),
    isValid: /* @__PURE__ */ __name((num) => {
      if (typeof num !== "bigint")
        throw new Error("invalid field element: expected bigint, got " + typeof num);
      return _0n2 <= num && num < ORDER;
    }, "isValid"),
    is0: /* @__PURE__ */ __name((num) => num === _0n2, "is0"),
    // is valid and invertible
    isValidNot0: /* @__PURE__ */ __name((num) => !f.is0(num) && f.isValid(num), "isValidNot0"),
    isOdd: /* @__PURE__ */ __name((num) => (num & _1n2) === _1n2, "isOdd"),
    neg: /* @__PURE__ */ __name((num) => mod(-num, ORDER), "neg"),
    eql: /* @__PURE__ */ __name((lhs, rhs) => lhs === rhs, "eql"),
    sqr: /* @__PURE__ */ __name((num) => mod(num * num, ORDER), "sqr"),
    add: /* @__PURE__ */ __name((lhs, rhs) => mod(lhs + rhs, ORDER), "add"),
    sub: /* @__PURE__ */ __name((lhs, rhs) => mod(lhs - rhs, ORDER), "sub"),
    mul: /* @__PURE__ */ __name((lhs, rhs) => mod(lhs * rhs, ORDER), "mul"),
    pow: /* @__PURE__ */ __name((num, power) => FpPow(f, num, power), "pow"),
    div: /* @__PURE__ */ __name((lhs, rhs) => mod(lhs * invert(rhs, ORDER), ORDER), "div"),
    // Same as above, but doesn't normalize
    sqrN: /* @__PURE__ */ __name((num) => num * num, "sqrN"),
    addN: /* @__PURE__ */ __name((lhs, rhs) => lhs + rhs, "addN"),
    subN: /* @__PURE__ */ __name((lhs, rhs) => lhs - rhs, "subN"),
    mulN: /* @__PURE__ */ __name((lhs, rhs) => lhs * rhs, "mulN"),
    inv: /* @__PURE__ */ __name((num) => invert(num, ORDER), "inv"),
    sqrt: _sqrt || ((n) => {
      if (!sqrtP)
        sqrtP = FpSqrt(ORDER);
      return sqrtP(f, n);
    }),
    toBytes: /* @__PURE__ */ __name((num) => isLE2 ? numberToBytesLE(num, BYTES) : numberToBytesBE(num, BYTES), "toBytes"),
    fromBytes: /* @__PURE__ */ __name((bytes, skipValidation = true) => {
      if (allowedLengths) {
        if (!allowedLengths.includes(bytes.length) || bytes.length > BYTES) {
          throw new Error("Field.fromBytes: expected " + allowedLengths + " bytes, got " + bytes.length);
        }
        const padded = new Uint8Array(BYTES);
        padded.set(bytes, isLE2 ? 0 : padded.length - bytes.length);
        bytes = padded;
      }
      if (bytes.length !== BYTES)
        throw new Error("Field.fromBytes: expected " + BYTES + " bytes, got " + bytes.length);
      let scalar = isLE2 ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
      if (modOnDecode)
        scalar = mod(scalar, ORDER);
      if (!skipValidation) {
        if (!f.isValid(scalar))
          throw new Error("invalid field element: outside of range 0..ORDER");
      }
      return scalar;
    }, "fromBytes"),
    // TODO: we don't need it here, move out to separate fn
    invertBatch: /* @__PURE__ */ __name((lst) => FpInvertBatch(f, lst), "invertBatch"),
    // We can't move this out because Fp6, Fp12 implement it
    // and it's unclear what to return in there.
    cmov: /* @__PURE__ */ __name((a, b, c) => c ? b : a, "cmov")
  });
  return Object.freeze(f);
}
var _0n2, _1n2, _2n, _3n, _4n, _5n, _7n, _8n, _9n, _16n, isNegativeLE, FIELD_FIELDS;
var init_modular = __esm({
  "../../node_modules/.pnpm/@noble+curves@1.9.4/node_modules/@noble/curves/esm/abstract/modular.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_utils6();
    _0n2 = BigInt(0);
    _1n2 = BigInt(1);
    _2n = /* @__PURE__ */ BigInt(2);
    _3n = /* @__PURE__ */ BigInt(3);
    _4n = /* @__PURE__ */ BigInt(4);
    _5n = /* @__PURE__ */ BigInt(5);
    _7n = /* @__PURE__ */ BigInt(7);
    _8n = /* @__PURE__ */ BigInt(8);
    _9n = /* @__PURE__ */ BigInt(9);
    _16n = /* @__PURE__ */ BigInt(16);
    __name(mod, "mod");
    __name(pow2, "pow2");
    __name(invert, "invert");
    __name(assertIsSquare, "assertIsSquare");
    __name(sqrt3mod4, "sqrt3mod4");
    __name(sqrt5mod8, "sqrt5mod8");
    __name(sqrt9mod16, "sqrt9mod16");
    __name(tonelliShanks, "tonelliShanks");
    __name(FpSqrt, "FpSqrt");
    isNegativeLE = /* @__PURE__ */ __name((num, modulo) => (mod(num, modulo) & _1n2) === _1n2, "isNegativeLE");
    FIELD_FIELDS = [
      "create",
      "isValid",
      "is0",
      "neg",
      "inv",
      "sqrt",
      "sqr",
      "eql",
      "add",
      "sub",
      "mul",
      "pow",
      "div",
      "addN",
      "subN",
      "mulN",
      "sqrN"
    ];
    __name(validateField, "validateField");
    __name(FpPow, "FpPow");
    __name(FpInvertBatch, "FpInvertBatch");
    __name(FpLegendre, "FpLegendre");
    __name(nLength, "nLength");
    __name(Field, "Field");
  }
});

// ../../node_modules/.pnpm/@noble+curves@1.9.4/node_modules/@noble/curves/esm/abstract/curve.js
function negateCt(condition, item) {
  const neg = item.negate();
  return condition ? neg : item;
}
function normalizeZ(c, points) {
  const invertedZs = FpInvertBatch(c.Fp, points.map((p) => p.Z));
  return points.map((p, i) => c.fromAffine(p.toAffine(invertedZs[i])));
}
function validateW(W, bits) {
  if (!Number.isSafeInteger(W) || W <= 0 || W > bits)
    throw new Error("invalid window size, expected [1.." + bits + "], got W=" + W);
}
function calcWOpts(W, scalarBits) {
  validateW(W, scalarBits);
  const windows = Math.ceil(scalarBits / W) + 1;
  const windowSize = 2 ** (W - 1);
  const maxNumber = 2 ** W;
  const mask = bitMask(W);
  const shiftBy = BigInt(W);
  return { windows, windowSize, mask, maxNumber, shiftBy };
}
function calcOffsets(n, window, wOpts) {
  const { windowSize, mask, maxNumber, shiftBy } = wOpts;
  let wbits = Number(n & mask);
  let nextN = n >> shiftBy;
  if (wbits > windowSize) {
    wbits -= maxNumber;
    nextN += _1n3;
  }
  const offsetStart = window * windowSize;
  const offset = offsetStart + Math.abs(wbits) - 1;
  const isZero = wbits === 0;
  const isNeg = wbits < 0;
  const isNegF = window % 2 !== 0;
  const offsetF = offsetStart;
  return { nextN, offset, isZero, isNeg, isNegF, offsetF };
}
function validateMSMPoints(points, c) {
  if (!Array.isArray(points))
    throw new Error("array expected");
  points.forEach((p, i) => {
    if (!(p instanceof c))
      throw new Error("invalid point at index " + i);
  });
}
function validateMSMScalars(scalars, field) {
  if (!Array.isArray(scalars))
    throw new Error("array of scalars expected");
  scalars.forEach((s, i) => {
    if (!field.isValid(s))
      throw new Error("invalid scalar at index " + i);
  });
}
function getW(P) {
  return pointWindowSizes.get(P) || 1;
}
function assert0(n) {
  if (n !== _0n3)
    throw new Error("invalid wNAF");
}
function pippenger(c, fieldN, points, scalars) {
  validateMSMPoints(points, c);
  validateMSMScalars(scalars, fieldN);
  const plength = points.length;
  const slength = scalars.length;
  if (plength !== slength)
    throw new Error("arrays of points and scalars must have equal length");
  const zero = c.ZERO;
  const wbits = bitLen(BigInt(plength));
  let windowSize = 1;
  if (wbits > 12)
    windowSize = wbits - 3;
  else if (wbits > 4)
    windowSize = wbits - 2;
  else if (wbits > 0)
    windowSize = 2;
  const MASK = bitMask(windowSize);
  const buckets = new Array(Number(MASK) + 1).fill(zero);
  const lastBits = Math.floor((fieldN.BITS - 1) / windowSize) * windowSize;
  let sum = zero;
  for (let i = lastBits; i >= 0; i -= windowSize) {
    buckets.fill(zero);
    for (let j = 0; j < slength; j++) {
      const scalar = scalars[j];
      const wbits2 = Number(scalar >> BigInt(i) & MASK);
      buckets[wbits2] = buckets[wbits2].add(points[j]);
    }
    let resI = zero;
    for (let j = buckets.length - 1, sumI = zero; j > 0; j--) {
      sumI = sumI.add(buckets[j]);
      resI = resI.add(sumI);
    }
    sum = sum.add(resI);
    if (i !== 0)
      for (let j = 0; j < windowSize; j++)
        sum = sum.double();
  }
  return sum;
}
function createField(order, field) {
  if (field) {
    if (field.ORDER !== order)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    validateField(field);
    return field;
  } else {
    return Field(order);
  }
}
function _createCurveFields(type, CURVE, curveOpts = {}) {
  if (!CURVE || typeof CURVE !== "object")
    throw new Error(`expected valid ${type} CURVE object`);
  for (const p of ["p", "n", "h"]) {
    const val = CURVE[p];
    if (!(typeof val === "bigint" && val > _0n3))
      throw new Error(`CURVE.${p} must be positive bigint`);
  }
  const Fp2 = createField(CURVE.p, curveOpts.Fp);
  const Fn2 = createField(CURVE.n, curveOpts.Fn);
  const _b = type === "weierstrass" ? "b" : "d";
  const params = ["Gx", "Gy", "a", _b];
  for (const p of params) {
    if (!Fp2.isValid(CURVE[p]))
      throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
  }
  return { Fp: Fp2, Fn: Fn2 };
}
var _0n3, _1n3, pointPrecomputes, pointWindowSizes, wNAF;
var init_curve = __esm({
  "../../node_modules/.pnpm/@noble+curves@1.9.4/node_modules/@noble/curves/esm/abstract/curve.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_utils6();
    init_modular();
    _0n3 = BigInt(0);
    _1n3 = BigInt(1);
    __name(negateCt, "negateCt");
    __name(normalizeZ, "normalizeZ");
    __name(validateW, "validateW");
    __name(calcWOpts, "calcWOpts");
    __name(calcOffsets, "calcOffsets");
    __name(validateMSMPoints, "validateMSMPoints");
    __name(validateMSMScalars, "validateMSMScalars");
    pointPrecomputes = /* @__PURE__ */ new WeakMap();
    pointWindowSizes = /* @__PURE__ */ new WeakMap();
    __name(getW, "getW");
    __name(assert0, "assert0");
    wNAF = class {
      static {
        __name(this, "wNAF");
      }
      // Parametrized with a given Point class (not individual point)
      constructor(Point, bits) {
        this.BASE = Point.BASE;
        this.ZERO = Point.ZERO;
        this.Fn = Point.Fn;
        this.bits = bits;
      }
      // non-const time multiplication ladder
      _unsafeLadder(elm, n, p = this.ZERO) {
        let d = elm;
        while (n > _0n3) {
          if (n & _1n3)
            p = p.add(d);
          d = d.double();
          n >>= _1n3;
        }
        return p;
      }
      /**
       * Creates a wNAF precomputation window. Used for caching.
       * Default window size is set by `utils.precompute()` and is equal to 8.
       * Number of precomputed points depends on the curve size:
       * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
       * - 𝑊 is the window size
       * - 𝑛 is the bitlength of the curve order.
       * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
       * @param point Point instance
       * @param W window size
       * @returns precomputed point tables flattened to a single array
       */
      precomputeWindow(point, W) {
        const { windows, windowSize } = calcWOpts(W, this.bits);
        const points = [];
        let p = point;
        let base = p;
        for (let window = 0; window < windows; window++) {
          base = p;
          points.push(base);
          for (let i = 1; i < windowSize; i++) {
            base = base.add(p);
            points.push(base);
          }
          p = base.double();
        }
        return points;
      }
      /**
       * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
       * More compact implementation:
       * https://github.com/paulmillr/noble-secp256k1/blob/47cb1669b6e506ad66b35fe7d76132ae97465da2/index.ts#L502-L541
       * @returns real and fake (for const-time) points
       */
      wNAF(W, precomputes, n) {
        if (!this.Fn.isValid(n))
          throw new Error("invalid scalar");
        let p = this.ZERO;
        let f = this.BASE;
        const wo = calcWOpts(W, this.bits);
        for (let window = 0; window < wo.windows; window++) {
          const { nextN, offset, isZero, isNeg, isNegF, offsetF } = calcOffsets(n, window, wo);
          n = nextN;
          if (isZero) {
            f = f.add(negateCt(isNegF, precomputes[offsetF]));
          } else {
            p = p.add(negateCt(isNeg, precomputes[offset]));
          }
        }
        assert0(n);
        return { p, f };
      }
      /**
       * Implements ec unsafe (non const-time) multiplication using precomputed tables and w-ary non-adjacent form.
       * @param acc accumulator point to add result of multiplication
       * @returns point
       */
      wNAFUnsafe(W, precomputes, n, acc = this.ZERO) {
        const wo = calcWOpts(W, this.bits);
        for (let window = 0; window < wo.windows; window++) {
          if (n === _0n3)
            break;
          const { nextN, offset, isZero, isNeg } = calcOffsets(n, window, wo);
          n = nextN;
          if (isZero) {
            continue;
          } else {
            const item = precomputes[offset];
            acc = acc.add(isNeg ? item.negate() : item);
          }
        }
        assert0(n);
        return acc;
      }
      getPrecomputes(W, point, transform2) {
        let comp = pointPrecomputes.get(point);
        if (!comp) {
          comp = this.precomputeWindow(point, W);
          if (W !== 1) {
            if (typeof transform2 === "function")
              comp = transform2(comp);
            pointPrecomputes.set(point, comp);
          }
        }
        return comp;
      }
      cached(point, scalar, transform2) {
        const W = getW(point);
        return this.wNAF(W, this.getPrecomputes(W, point, transform2), scalar);
      }
      unsafe(point, scalar, transform2, prev) {
        const W = getW(point);
        if (W === 1)
          return this._unsafeLadder(point, scalar, prev);
        return this.wNAFUnsafe(W, this.getPrecomputes(W, point, transform2), scalar, prev);
      }
      // We calculate precomputes for elliptic curve point multiplication
      // using windowed method. This specifies window size and
      // stores precomputed values. Usually only base point would be precomputed.
      createCache(P, W) {
        validateW(W, this.bits);
        pointWindowSizes.set(P, W);
        pointPrecomputes.delete(P);
      }
      hasCache(elm) {
        return getW(elm) !== 1;
      }
    };
    __name(pippenger, "pippenger");
    __name(createField, "createField");
    __name(_createCurveFields, "_createCurveFields");
  }
});

// ../../node_modules/.pnpm/@noble+curves@1.9.4/node_modules/@noble/curves/esm/abstract/edwards.js
function isEdValidXY(Fp2, CURVE, x, y) {
  const x2 = Fp2.sqr(x);
  const y2 = Fp2.sqr(y);
  const left = Fp2.add(Fp2.mul(CURVE.a, x2), y2);
  const right = Fp2.add(Fp2.ONE, Fp2.mul(CURVE.d, Fp2.mul(x2, y2)));
  return Fp2.eql(left, right);
}
function edwards(CURVE, curveOpts = {}) {
  const { Fp: Fp2, Fn: Fn2 } = _createCurveFields("edwards", CURVE, curveOpts);
  const { h: cofactor, n: CURVE_ORDER } = CURVE;
  _validateObject(curveOpts, {}, { uvRatio: "function" });
  const MASK = _2n2 << BigInt(Fn2.BYTES * 8) - _1n4;
  const modP = /* @__PURE__ */ __name((n) => Fp2.create(n), "modP");
  const uvRatio2 = curveOpts.uvRatio || ((u, v) => {
    try {
      return { isValid: true, value: Fp2.sqrt(Fp2.div(u, v)) };
    } catch (e) {
      return { isValid: false, value: _0n4 };
    }
  });
  if (!isEdValidXY(Fp2, CURVE, CURVE.Gx, CURVE.Gy))
    throw new Error("bad curve params: generator point");
  function acoord(title2, n, banZero = false) {
    const min = banZero ? _1n4 : _0n4;
    aInRange("coordinate " + title2, n, min, MASK);
    return n;
  }
  __name(acoord, "acoord");
  function aextpoint(other) {
    if (!(other instanceof Point))
      throw new Error("ExtendedPoint expected");
  }
  __name(aextpoint, "aextpoint");
  const toAffineMemo = memoized((p, iz) => {
    const { X, Y, Z } = p;
    const is0 = p.is0();
    if (iz == null)
      iz = is0 ? _8n2 : Fp2.inv(Z);
    const x = modP(X * iz);
    const y = modP(Y * iz);
    const zz = Fp2.mul(Z, iz);
    if (is0)
      return { x: _0n4, y: _1n4 };
    if (zz !== _1n4)
      throw new Error("invZ was invalid");
    return { x, y };
  });
  const assertValidMemo = memoized((p) => {
    const { a, d } = CURVE;
    if (p.is0())
      throw new Error("bad point: ZERO");
    const { X, Y, Z, T } = p;
    const X2 = modP(X * X);
    const Y2 = modP(Y * Y);
    const Z2 = modP(Z * Z);
    const Z4 = modP(Z2 * Z2);
    const aX2 = modP(X2 * a);
    const left = modP(Z2 * modP(aX2 + Y2));
    const right = modP(Z4 + modP(d * modP(X2 * Y2)));
    if (left !== right)
      throw new Error("bad point: equation left != right (1)");
    const XY = modP(X * Y);
    const ZT = modP(Z * T);
    if (XY !== ZT)
      throw new Error("bad point: equation left != right (2)");
    return true;
  });
  class Point {
    static {
      __name(this, "Point");
    }
    constructor(X, Y, Z, T) {
      this.X = acoord("x", X);
      this.Y = acoord("y", Y);
      this.Z = acoord("z", Z, true);
      this.T = acoord("t", T);
      Object.freeze(this);
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    // TODO: remove
    get ex() {
      return this.X;
    }
    get ey() {
      return this.Y;
    }
    get ez() {
      return this.Z;
    }
    get et() {
      return this.T;
    }
    static normalizeZ(points) {
      return normalizeZ(Point, points);
    }
    static msm(points, scalars) {
      return pippenger(Point, Fn2, points, scalars);
    }
    _setWindowSize(windowSize) {
      this.precompute(windowSize);
    }
    static fromAffine(p) {
      if (p instanceof Point)
        throw new Error("extended point not allowed");
      const { x, y } = p || {};
      acoord("x", x);
      acoord("y", y);
      return new Point(x, y, _1n4, modP(x * y));
    }
    precompute(windowSize = 8, isLazy = true) {
      wnaf.createCache(this, windowSize);
      if (!isLazy)
        this.multiply(_2n2);
      return this;
    }
    // Useful in fromAffine() - not for fromBytes(), which always created valid points.
    assertValidity() {
      assertValidMemo(this);
    }
    // Compare one point to another.
    equals(other) {
      aextpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      const X1Z2 = modP(X1 * Z2);
      const X2Z1 = modP(X2 * Z1);
      const Y1Z2 = modP(Y1 * Z2);
      const Y2Z1 = modP(Y2 * Z1);
      return X1Z2 === X2Z1 && Y1Z2 === Y2Z1;
    }
    is0() {
      return this.equals(Point.ZERO);
    }
    negate() {
      return new Point(modP(-this.X), this.Y, this.Z, modP(-this.T));
    }
    // Fast algo for doubling Extended Point.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#doubling-dbl-2008-hwcd
    // Cost: 4M + 4S + 1*a + 6add + 1*2.
    double() {
      const { a } = CURVE;
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const A = modP(X1 * X1);
      const B = modP(Y1 * Y1);
      const C = modP(_2n2 * modP(Z1 * Z1));
      const D = modP(a * A);
      const x1y1 = X1 + Y1;
      const E = modP(modP(x1y1 * x1y1) - A - B);
      const G = D + B;
      const F = G - C;
      const H = D - B;
      const X3 = modP(E * F);
      const Y3 = modP(G * H);
      const T3 = modP(E * H);
      const Z3 = modP(F * G);
      return new Point(X3, Y3, Z3, T3);
    }
    // Fast algo for adding 2 Extended Points.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#addition-add-2008-hwcd
    // Cost: 9M + 1*a + 1*d + 7add.
    add(other) {
      aextpoint(other);
      const { a, d } = CURVE;
      const { X: X1, Y: Y1, Z: Z1, T: T1 } = this;
      const { X: X2, Y: Y2, Z: Z2, T: T2 } = other;
      const A = modP(X1 * X2);
      const B = modP(Y1 * Y2);
      const C = modP(T1 * d * T2);
      const D = modP(Z1 * Z2);
      const E = modP((X1 + Y1) * (X2 + Y2) - A - B);
      const F = D - C;
      const G = D + C;
      const H = modP(B - a * A);
      const X3 = modP(E * F);
      const Y3 = modP(G * H);
      const T3 = modP(E * H);
      const Z3 = modP(F * G);
      return new Point(X3, Y3, Z3, T3);
    }
    subtract(other) {
      return this.add(other.negate());
    }
    // Constant-time multiplication.
    multiply(scalar) {
      const n = scalar;
      aInRange("scalar", n, _1n4, CURVE_ORDER);
      const { p, f } = wnaf.cached(this, n, (p2) => normalizeZ(Point, p2));
      return normalizeZ(Point, [p, f])[0];
    }
    // Non-constant-time multiplication. Uses double-and-add algorithm.
    // It's faster, but should only be used when you don't care about
    // an exposed private key e.g. sig verification.
    // Does NOT allow scalars higher than CURVE.n.
    // Accepts optional accumulator to merge with multiply (important for sparse scalars)
    multiplyUnsafe(scalar, acc = Point.ZERO) {
      const n = scalar;
      aInRange("scalar", n, _0n4, CURVE_ORDER);
      if (n === _0n4)
        return Point.ZERO;
      if (this.is0() || n === _1n4)
        return this;
      return wnaf.unsafe(this, n, (p) => normalizeZ(Point, p), acc);
    }
    // Checks if point is of small order.
    // If you add something to small order point, you will have "dirty"
    // point with torsion component.
    // Multiplies point by cofactor and checks if the result is 0.
    isSmallOrder() {
      return this.multiplyUnsafe(cofactor).is0();
    }
    // Multiplies point by curve order and checks if the result is 0.
    // Returns `false` is the point is dirty.
    isTorsionFree() {
      return wnaf.unsafe(this, CURVE_ORDER).is0();
    }
    // Converts Extended point to default (x, y) coordinates.
    // Can accept precomputed Z^-1 - for example, from invertBatch.
    toAffine(invertedZ) {
      return toAffineMemo(this, invertedZ);
    }
    clearCofactor() {
      if (cofactor === _1n4)
        return this;
      return this.multiplyUnsafe(cofactor);
    }
    static fromBytes(bytes, zip215 = false) {
      abytes(bytes);
      return Point.fromHex(bytes, zip215);
    }
    // Converts hash string or Uint8Array to Point.
    // Uses algo from RFC8032 5.1.3.
    static fromHex(hex, zip215 = false) {
      const { d, a } = CURVE;
      const len = Fp2.BYTES;
      hex = ensureBytes("pointHex", hex, len);
      abool("zip215", zip215);
      const normed = hex.slice();
      const lastByte = hex[len - 1];
      normed[len - 1] = lastByte & ~128;
      const y = bytesToNumberLE(normed);
      const max = zip215 ? MASK : Fp2.ORDER;
      aInRange("pointHex.y", y, _0n4, max);
      const y2 = modP(y * y);
      const u = modP(y2 - _1n4);
      const v = modP(d * y2 - a);
      let { isValid, value: x } = uvRatio2(u, v);
      if (!isValid)
        throw new Error("Point.fromHex: invalid y coordinate");
      const isXOdd = (x & _1n4) === _1n4;
      const isLastByteOdd = (lastByte & 128) !== 0;
      if (!zip215 && x === _0n4 && isLastByteOdd)
        throw new Error("Point.fromHex: x=0 and x_0=1");
      if (isLastByteOdd !== isXOdd)
        x = modP(-x);
      return Point.fromAffine({ x, y });
    }
    toBytes() {
      const { x, y } = this.toAffine();
      const bytes = numberToBytesLE(y, Fp2.BYTES);
      bytes[bytes.length - 1] |= x & _1n4 ? 128 : 0;
      return bytes;
    }
    /** @deprecated use `toBytes` */
    toRawBytes() {
      return this.toBytes();
    }
    toHex() {
      return bytesToHex(this.toBytes());
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  Point.BASE = new Point(CURVE.Gx, CURVE.Gy, _1n4, modP(CURVE.Gx * CURVE.Gy));
  Point.ZERO = new Point(_0n4, _1n4, _1n4, _0n4);
  Point.Fp = Fp2;
  Point.Fn = Fn2;
  const wnaf = new wNAF(Point, Fn2.BYTES * 8);
  return Point;
}
function eddsa(Point, cHash, eddsaOpts) {
  if (typeof cHash !== "function")
    throw new Error('"hash" function param is required');
  _validateObject(eddsaOpts, {}, {
    adjustScalarBytes: "function",
    randomBytes: "function",
    domain: "function",
    prehash: "function",
    mapToCurve: "function"
  });
  const { prehash } = eddsaOpts;
  const { BASE: G, Fp: Fp2, Fn: Fn2 } = Point;
  const CURVE_ORDER = Fn2.ORDER;
  const randomBytes_ = eddsaOpts.randomBytes || randomBytes;
  const adjustScalarBytes2 = eddsaOpts.adjustScalarBytes || ((bytes) => bytes);
  const domain2 = eddsaOpts.domain || ((data, ctx, phflag) => {
    abool("phflag", phflag);
    if (ctx.length || phflag)
      throw new Error("Contexts/pre-hash are not supported");
    return data;
  });
  function modN(a) {
    return Fn2.create(a);
  }
  __name(modN, "modN");
  function modN_LE(hash) {
    return modN(bytesToNumberLE(hash));
  }
  __name(modN_LE, "modN_LE");
  function getPrivateScalar(key) {
    const len = Fp2.BYTES;
    key = ensureBytes("private key", key, len);
    const hashed = ensureBytes("hashed private key", cHash(key), 2 * len);
    const head = adjustScalarBytes2(hashed.slice(0, len));
    const prefix = hashed.slice(len, 2 * len);
    const scalar = modN_LE(head);
    return { head, prefix, scalar };
  }
  __name(getPrivateScalar, "getPrivateScalar");
  function getExtendedPublicKey(secretKey) {
    const { head, prefix, scalar } = getPrivateScalar(secretKey);
    const point = G.multiply(scalar);
    const pointBytes = point.toBytes();
    return { head, prefix, scalar, point, pointBytes };
  }
  __name(getExtendedPublicKey, "getExtendedPublicKey");
  function getPublicKey(secretKey) {
    return getExtendedPublicKey(secretKey).pointBytes;
  }
  __name(getPublicKey, "getPublicKey");
  function hashDomainToScalar(context2 = Uint8Array.of(), ...msgs) {
    const msg = concatBytes(...msgs);
    return modN_LE(cHash(domain2(msg, ensureBytes("context", context2), !!prehash)));
  }
  __name(hashDomainToScalar, "hashDomainToScalar");
  function sign(msg, secretKey, options = {}) {
    msg = ensureBytes("message", msg);
    if (prehash)
      msg = prehash(msg);
    const { prefix, scalar, pointBytes } = getExtendedPublicKey(secretKey);
    const r = hashDomainToScalar(options.context, prefix, msg);
    const R = G.multiply(r).toBytes();
    const k = hashDomainToScalar(options.context, R, pointBytes, msg);
    const s = modN(r + k * scalar);
    aInRange("signature.s", s, _0n4, CURVE_ORDER);
    const L = Fp2.BYTES;
    const res = concatBytes(R, numberToBytesLE(s, L));
    return ensureBytes("result", res, L * 2);
  }
  __name(sign, "sign");
  const verifyOpts = { zip215: true };
  function verify(sig, msg, publicKey, options = verifyOpts) {
    const { context: context2, zip215 } = options;
    const len = Fp2.BYTES;
    sig = ensureBytes("signature", sig, 2 * len);
    msg = ensureBytes("message", msg);
    publicKey = ensureBytes("publicKey", publicKey, len);
    if (zip215 !== void 0)
      abool("zip215", zip215);
    if (prehash)
      msg = prehash(msg);
    const s = bytesToNumberLE(sig.slice(len, 2 * len));
    let A, R, SB;
    try {
      A = Point.fromHex(publicKey, zip215);
      R = Point.fromHex(sig.slice(0, len), zip215);
      SB = G.multiplyUnsafe(s);
    } catch (error3) {
      return false;
    }
    if (!zip215 && A.isSmallOrder())
      return false;
    const k = hashDomainToScalar(context2, R.toBytes(), A.toBytes(), msg);
    const RkA = R.add(A.multiplyUnsafe(k));
    return RkA.subtract(SB).clearCofactor().is0();
  }
  __name(verify, "verify");
  G.precompute(8);
  const size = Fp2.BYTES;
  const lengths = {
    secret: size,
    public: size,
    signature: 2 * size,
    seed: size
  };
  function randomSecretKey(seed = randomBytes_(lengths.seed)) {
    return seed;
  }
  __name(randomSecretKey, "randomSecretKey");
  const utils = {
    getExtendedPublicKey,
    /** ed25519 priv keys are uniform 32b. No need to check for modulo bias, like in secp256k1. */
    randomSecretKey,
    isValidSecretKey,
    isValidPublicKey,
    randomPrivateKey: randomSecretKey,
    /**
     * Converts ed public key to x public key. Uses formula:
     * - ed25519:
     *   - `(u, v) = ((1+y)/(1-y), sqrt(-486664)*u/x)`
     *   - `(x, y) = (sqrt(-486664)*u/v, (u-1)/(u+1))`
     * - ed448:
     *   - `(u, v) = ((y-1)/(y+1), sqrt(156324)*u/x)`
     *   - `(x, y) = (sqrt(156324)*u/v, (1+u)/(1-u))`
     *
     * There is NO `fromMontgomery`:
     * - There are 2 valid ed25519 points for every x25519, with flipped coordinate
     * - Sometimes there are 0 valid ed25519 points, because x25519 *additionally*
     *   accepts inputs on the quadratic twist, which can't be moved to ed25519
     */
    toMontgomery(publicKey) {
      const { y } = Point.fromBytes(publicKey);
      const is25519 = size === 32;
      if (!is25519 && size !== 57)
        throw new Error("only defined for 25519 and 448");
      const u = is25519 ? Fp2.div(_1n4 + y, _1n4 - y) : Fp2.div(y - _1n4, y + _1n4);
      return Fp2.toBytes(u);
    },
    toMontgomeryPriv(privateKey) {
      abytes(privateKey, size);
      const hashed = cHash(privateKey.subarray(0, size));
      return adjustScalarBytes2(hashed).subarray(0, size);
    },
    /**
     * We're doing scalar multiplication (used in getPublicKey etc) with precomputed BASE_POINT
     * values. This slows down first getPublicKey() by milliseconds (see Speed section),
     * but allows to speed-up subsequent getPublicKey() calls up to 20x.
     * @param windowSize 2, 4, 8, 16
     */
    precompute(windowSize = 8, point = Point.BASE) {
      return point.precompute(windowSize, false);
    }
  };
  function keygen(seed) {
    const secretKey = utils.randomSecretKey(seed);
    return { secretKey, publicKey: getPublicKey(secretKey) };
  }
  __name(keygen, "keygen");
  function isValidSecretKey(key) {
    try {
      return !!Fn2.fromBytes(key, false);
    } catch (error3) {
      return false;
    }
  }
  __name(isValidSecretKey, "isValidSecretKey");
  function isValidPublicKey(key, zip215) {
    try {
      return !!Point.fromBytes(key, zip215);
    } catch (error3) {
      return false;
    }
  }
  __name(isValidPublicKey, "isValidPublicKey");
  return Object.freeze({
    keygen,
    getPublicKey,
    sign,
    verify,
    utils,
    Point,
    info: { type: "edwards", lengths }
  });
}
function _eddsa_legacy_opts_to_new(c) {
  const CURVE = {
    a: c.a,
    d: c.d,
    p: c.Fp.ORDER,
    n: c.n,
    h: c.h,
    Gx: c.Gx,
    Gy: c.Gy
  };
  const Fp2 = c.Fp;
  const Fn2 = Field(CURVE.n, c.nBitLength, true);
  const curveOpts = { Fp: Fp2, Fn: Fn2, uvRatio: c.uvRatio };
  const eddsaOpts = {
    randomBytes: c.randomBytes,
    adjustScalarBytes: c.adjustScalarBytes,
    domain: c.domain,
    prehash: c.prehash,
    mapToCurve: c.mapToCurve
  };
  return { CURVE, curveOpts, hash: c.hash, eddsaOpts };
}
function _eddsa_new_output_to_legacy(c, eddsa2) {
  const legacy = Object.assign({}, eddsa2, { ExtendedPoint: eddsa2.Point, CURVE: c });
  return legacy;
}
function twistedEdwards(c) {
  const { CURVE, curveOpts, hash, eddsaOpts } = _eddsa_legacy_opts_to_new(c);
  const Point = edwards(CURVE, curveOpts);
  const EDDSA = eddsa(Point, hash, eddsaOpts);
  return _eddsa_new_output_to_legacy(c, EDDSA);
}
var _0n4, _1n4, _2n2, _8n2, PrimeEdwardsPoint;
var init_edwards = __esm({
  "../../node_modules/.pnpm/@noble+curves@1.9.4/node_modules/@noble/curves/esm/abstract/edwards.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_utils6();
    init_curve();
    init_modular();
    _0n4 = BigInt(0);
    _1n4 = BigInt(1);
    _2n2 = BigInt(2);
    _8n2 = BigInt(8);
    __name(isEdValidXY, "isEdValidXY");
    __name(edwards, "edwards");
    PrimeEdwardsPoint = class {
      static {
        __name(this, "PrimeEdwardsPoint");
      }
      constructor(ep) {
        this.ep = ep;
      }
      // Static methods that must be implemented by subclasses
      static fromBytes(_bytes2) {
        throw new Error("fromBytes must be implemented by subclass");
      }
      static fromHex(_hex) {
        throw new Error("fromHex must be implemented by subclass");
      }
      get x() {
        return this.toAffine().x;
      }
      get y() {
        return this.toAffine().y;
      }
      // Common implementations
      clearCofactor() {
        return this;
      }
      assertValidity() {
        this.ep.assertValidity();
      }
      toAffine(invertedZ) {
        return this.ep.toAffine(invertedZ);
      }
      /** @deprecated use `toBytes` */
      toRawBytes() {
        return this.toBytes();
      }
      toHex() {
        return bytesToHex(this.toBytes());
      }
      toString() {
        return this.toHex();
      }
      isTorsionFree() {
        return true;
      }
      isSmallOrder() {
        return false;
      }
      add(other) {
        this.assertSame(other);
        return this.init(this.ep.add(other.ep));
      }
      subtract(other) {
        this.assertSame(other);
        return this.init(this.ep.subtract(other.ep));
      }
      multiply(scalar) {
        return this.init(this.ep.multiply(scalar));
      }
      multiplyUnsafe(scalar) {
        return this.init(this.ep.multiplyUnsafe(scalar));
      }
      double() {
        return this.init(this.ep.double());
      }
      negate() {
        return this.init(this.ep.negate());
      }
      precompute(windowSize, isLazy) {
        return this.init(this.ep.precompute(windowSize, isLazy));
      }
    };
    __name(eddsa, "eddsa");
    __name(_eddsa_legacy_opts_to_new, "_eddsa_legacy_opts_to_new");
    __name(_eddsa_new_output_to_legacy, "_eddsa_new_output_to_legacy");
    __name(twistedEdwards, "twistedEdwards");
  }
});

// ../../node_modules/.pnpm/@noble+curves@1.9.4/node_modules/@noble/curves/esm/ed25519.js
function ed25519_pow_2_252_3(x) {
  const _10n = BigInt(10), _20n = BigInt(20), _40n = BigInt(40), _80n = BigInt(80);
  const P = ed25519_CURVE.p;
  const x2 = x * x % P;
  const b2 = x2 * x % P;
  const b4 = pow2(b2, _2n3, P) * b2 % P;
  const b5 = pow2(b4, _1n5, P) * x % P;
  const b10 = pow2(b5, _5n2, P) * b5 % P;
  const b20 = pow2(b10, _10n, P) * b10 % P;
  const b40 = pow2(b20, _20n, P) * b20 % P;
  const b80 = pow2(b40, _40n, P) * b40 % P;
  const b160 = pow2(b80, _80n, P) * b80 % P;
  const b240 = pow2(b160, _80n, P) * b80 % P;
  const b250 = pow2(b240, _10n, P) * b10 % P;
  const pow_p_5_8 = pow2(b250, _2n3, P) * x % P;
  return { pow_p_5_8, b2 };
}
function adjustScalarBytes(bytes) {
  bytes[0] &= 248;
  bytes[31] &= 127;
  bytes[31] |= 64;
  return bytes;
}
function uvRatio(u, v) {
  const P = ed25519_CURVE.p;
  const v3 = mod(v * v * v, P);
  const v7 = mod(v3 * v3 * v, P);
  const pow = ed25519_pow_2_252_3(u * v7).pow_p_5_8;
  let x = mod(u * v3 * pow, P);
  const vx2 = mod(v * x * x, P);
  const root1 = x;
  const root2 = mod(x * ED25519_SQRT_M1, P);
  const useRoot1 = vx2 === u;
  const useRoot2 = vx2 === mod(-u, P);
  const noRoot = vx2 === mod(-u * ED25519_SQRT_M1, P);
  if (useRoot1)
    x = root1;
  if (useRoot2 || noRoot)
    x = root2;
  if (isNegativeLE(x, P))
    x = mod(-x, P);
  return { isValid: useRoot1 || useRoot2, value: x };
}
function calcElligatorRistrettoMap(r0) {
  const { d } = ed25519.CURVE;
  const P = ed25519.CURVE.Fp.ORDER;
  const mod2 = ed25519.CURVE.Fp.create;
  const r = mod2(SQRT_M1 * r0 * r0);
  const Ns = mod2((r + _1n5) * ONE_MINUS_D_SQ);
  let c = BigInt(-1);
  const D = mod2((c - d * r) * mod2(r + d));
  let { isValid: Ns_D_is_sq, value: s } = uvRatio(Ns, D);
  let s_ = mod2(s * r0);
  if (!isNegativeLE(s_, P))
    s_ = mod2(-s_);
  if (!Ns_D_is_sq)
    s = s_;
  if (!Ns_D_is_sq)
    c = r;
  const Nt = mod2(c * (r - _1n5) * D_MINUS_ONE_SQ - D);
  const s2 = s * s;
  const W0 = mod2((s + s) * D);
  const W1 = mod2(Nt * SQRT_AD_MINUS_ONE);
  const W2 = mod2(_1n5 - s2);
  const W3 = mod2(_1n5 + s2);
  return new ed25519.Point(mod2(W0 * W3), mod2(W2 * W1), mod2(W1 * W3), mod2(W0 * W2));
}
function ristretto255_map(bytes) {
  abytes(bytes, 64);
  const r1 = bytes255ToNumberLE(bytes.subarray(0, 32));
  const R1 = calcElligatorRistrettoMap(r1);
  const r2 = bytes255ToNumberLE(bytes.subarray(32, 64));
  const R2 = calcElligatorRistrettoMap(r2);
  return new _RistrettoPoint(R1.add(R2));
}
var _0n5, _1n5, _2n3, _3n2, _5n2, _8n3, ed25519_CURVE, ED25519_SQRT_M1, Fp, Fn, ed25519Defaults, ed25519, SQRT_M1, SQRT_AD_MINUS_ONE, INVSQRT_A_MINUS_D, ONE_MINUS_D_SQ, D_MINUS_ONE_SQ, invertSqrt, MAX_255B, bytes255ToNumberLE, _RistrettoPoint;
var init_ed25519 = __esm({
  "../../node_modules/.pnpm/@noble+curves@1.9.4/node_modules/@noble/curves/esm/ed25519.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_sha2();
    init_utils3();
    init_curve();
    init_edwards();
    init_modular();
    init_utils6();
    _0n5 = BigInt(0);
    _1n5 = BigInt(1);
    _2n3 = BigInt(2);
    _3n2 = BigInt(3);
    _5n2 = BigInt(5);
    _8n3 = BigInt(8);
    ed25519_CURVE = {
      p: BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed"),
      n: BigInt("0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed"),
      h: _8n3,
      a: BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec"),
      d: BigInt("0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3"),
      Gx: BigInt("0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a"),
      Gy: BigInt("0x6666666666666666666666666666666666666666666666666666666666666658")
    };
    __name(ed25519_pow_2_252_3, "ed25519_pow_2_252_3");
    __name(adjustScalarBytes, "adjustScalarBytes");
    ED25519_SQRT_M1 = /* @__PURE__ */ BigInt("19681161376707505956807079304988542015446066515923890162744021073123829784752");
    __name(uvRatio, "uvRatio");
    Fp = /* @__PURE__ */ (() => Field(ed25519_CURVE.p, { isLE: true }))();
    Fn = /* @__PURE__ */ (() => Field(ed25519_CURVE.n, { isLE: true }))();
    ed25519Defaults = /* @__PURE__ */ (() => ({
      ...ed25519_CURVE,
      Fp,
      hash: sha512,
      adjustScalarBytes,
      // dom2
      // Ratio of u to v. Allows us to combine inversion and square root. Uses algo from RFC8032 5.1.3.
      // Constant-time, u/√v
      uvRatio
    }))();
    ed25519 = /* @__PURE__ */ (() => twistedEdwards(ed25519Defaults))();
    SQRT_M1 = ED25519_SQRT_M1;
    SQRT_AD_MINUS_ONE = /* @__PURE__ */ BigInt("25063068953384623474111414158702152701244531502492656460079210482610430750235");
    INVSQRT_A_MINUS_D = /* @__PURE__ */ BigInt("54469307008909316920995813868745141605393597292927456921205312896311721017578");
    ONE_MINUS_D_SQ = /* @__PURE__ */ BigInt("1159843021668779879193775521855586647937357759715417654439879720876111806838");
    D_MINUS_ONE_SQ = /* @__PURE__ */ BigInt("40440834346308536858101042469323190826248399146238708352240133220865137265952");
    invertSqrt = /* @__PURE__ */ __name((number2) => uvRatio(_1n5, number2), "invertSqrt");
    MAX_255B = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    bytes255ToNumberLE = /* @__PURE__ */ __name((bytes) => ed25519.CURVE.Fp.create(bytesToNumberLE(bytes) & MAX_255B), "bytes255ToNumberLE");
    __name(calcElligatorRistrettoMap, "calcElligatorRistrettoMap");
    __name(ristretto255_map, "ristretto255_map");
    _RistrettoPoint = class __RistrettoPoint extends PrimeEdwardsPoint {
      static {
        __name(this, "_RistrettoPoint");
      }
      constructor(ep) {
        super(ep);
      }
      static fromAffine(ap) {
        return new __RistrettoPoint(ed25519.Point.fromAffine(ap));
      }
      assertSame(other) {
        if (!(other instanceof __RistrettoPoint))
          throw new Error("RistrettoPoint expected");
      }
      init(ep) {
        return new __RistrettoPoint(ep);
      }
      /** @deprecated use `import { ristretto255_hasher } from '@noble/curves/ed25519.js';` */
      static hashToCurve(hex) {
        return ristretto255_map(ensureBytes("ristrettoHash", hex, 64));
      }
      static fromBytes(bytes) {
        abytes(bytes, 32);
        const { a, d } = ed25519.CURVE;
        const P = Fp.ORDER;
        const mod2 = Fp.create;
        const s = bytes255ToNumberLE(bytes);
        if (!equalBytes(numberToBytesLE(s, 32), bytes) || isNegativeLE(s, P))
          throw new Error("invalid ristretto255 encoding 1");
        const s2 = mod2(s * s);
        const u1 = mod2(_1n5 + a * s2);
        const u2 = mod2(_1n5 - a * s2);
        const u1_2 = mod2(u1 * u1);
        const u2_2 = mod2(u2 * u2);
        const v = mod2(a * d * u1_2 - u2_2);
        const { isValid, value: I } = invertSqrt(mod2(v * u2_2));
        const Dx = mod2(I * u2);
        const Dy = mod2(I * Dx * v);
        let x = mod2((s + s) * Dx);
        if (isNegativeLE(x, P))
          x = mod2(-x);
        const y = mod2(u1 * Dy);
        const t = mod2(x * y);
        if (!isValid || isNegativeLE(t, P) || y === _0n5)
          throw new Error("invalid ristretto255 encoding 2");
        return new __RistrettoPoint(new ed25519.Point(x, y, _1n5, t));
      }
      /**
       * Converts ristretto-encoded string to ristretto point.
       * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-decode).
       * @param hex Ristretto-encoded 32 bytes. Not every 32-byte string is valid ristretto encoding
       */
      static fromHex(hex) {
        return __RistrettoPoint.fromBytes(ensureBytes("ristrettoHex", hex, 32));
      }
      static msm(points, scalars) {
        return pippenger(__RistrettoPoint, ed25519.Point.Fn, points, scalars);
      }
      /**
       * Encodes ristretto point to Uint8Array.
       * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-encode).
       */
      toBytes() {
        let { X, Y, Z, T } = this.ep;
        const P = Fp.ORDER;
        const mod2 = Fp.create;
        const u1 = mod2(mod2(Z + Y) * mod2(Z - Y));
        const u2 = mod2(X * Y);
        const u2sq = mod2(u2 * u2);
        const { value: invsqrt } = invertSqrt(mod2(u1 * u2sq));
        const D1 = mod2(invsqrt * u1);
        const D2 = mod2(invsqrt * u2);
        const zInv = mod2(D1 * D2 * T);
        let D;
        if (isNegativeLE(T * zInv, P)) {
          let _x = mod2(Y * SQRT_M1);
          let _y = mod2(X * SQRT_M1);
          X = _x;
          Y = _y;
          D = mod2(D1 * INVSQRT_A_MINUS_D);
        } else {
          D = D2;
        }
        if (isNegativeLE(X * zInv, P))
          Y = mod2(-Y);
        let s = mod2((Z - Y) * D);
        if (isNegativeLE(s, P))
          s = mod2(-s);
        return numberToBytesLE(s, 32);
      }
      /**
       * Compares two Ristretto points.
       * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-equals).
       */
      equals(other) {
        this.assertSame(other);
        const { X: X1, Y: Y1 } = this.ep;
        const { X: X2, Y: Y2 } = other.ep;
        const mod2 = Fp.create;
        const one = mod2(X1 * Y2) === mod2(Y1 * X2);
        const two = mod2(Y1 * Y2) === mod2(X1 * X2);
        return one || two;
      }
      is0() {
        return this.equals(__RistrettoPoint.ZERO);
      }
    };
    _RistrettoPoint.BASE = /* @__PURE__ */ (() => new _RistrettoPoint(ed25519.Point.BASE))();
    _RistrettoPoint.ZERO = /* @__PURE__ */ (() => new _RistrettoPoint(ed25519.Point.ZERO))();
    _RistrettoPoint.Fp = Fp;
    _RistrettoPoint.Fn = Fn;
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/cryptography/intent.js
function messageWithIntent(scope, message) {
  return suiBcs.IntentMessage(suiBcs.bytes(message.length)).serialize({
    intent: {
      scope: { [scope]: true },
      version: { V0: true },
      appId: { Sui: true }
    },
    value: message
  }).toBytes();
}
var init_intent = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/cryptography/intent.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_bcs3();
    __name(messageWithIntent, "messageWithIntent");
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/cryptography/signature-scheme.js
var SIGNATURE_SCHEME_TO_FLAG, SIGNATURE_SCHEME_TO_SIZE, SIGNATURE_FLAG_TO_SCHEME;
var init_signature_scheme = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/cryptography/signature-scheme.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    SIGNATURE_SCHEME_TO_FLAG = {
      ED25519: 0,
      Secp256k1: 1,
      Secp256r1: 2,
      MultiSig: 3,
      ZkLogin: 5,
      Passkey: 6
    };
    SIGNATURE_SCHEME_TO_SIZE = {
      ED25519: 32,
      Secp256k1: 33,
      Secp256r1: 33,
      Passkey: 33
    };
    SIGNATURE_FLAG_TO_SCHEME = {
      0: "ED25519",
      1: "Secp256k1",
      2: "Secp256r1",
      3: "MultiSig",
      5: "ZkLogin",
      6: "Passkey"
    };
  }
});

// ../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/hmac.js
var HMAC, hmac;
var init_hmac = __esm({
  "../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/hmac.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_utils3();
    HMAC = class extends Hash {
      static {
        __name(this, "HMAC");
      }
      constructor(hash, _key) {
        super();
        this.finished = false;
        this.destroyed = false;
        ahash(hash);
        const key = toBytes(_key);
        this.iHash = hash.create();
        if (typeof this.iHash.update !== "function")
          throw new Error("Expected instance of class which extends utils.Hash");
        this.blockLen = this.iHash.blockLen;
        this.outputLen = this.iHash.outputLen;
        const blockLen = this.blockLen;
        const pad = new Uint8Array(blockLen);
        pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
        for (let i = 0; i < pad.length; i++)
          pad[i] ^= 54;
        this.iHash.update(pad);
        this.oHash = hash.create();
        for (let i = 0; i < pad.length; i++)
          pad[i] ^= 54 ^ 92;
        this.oHash.update(pad);
        clean(pad);
      }
      update(buf) {
        aexists(this);
        this.iHash.update(buf);
        return this;
      }
      digestInto(out) {
        aexists(this);
        abytes(out, this.outputLen);
        this.finished = true;
        this.iHash.digestInto(out);
        this.oHash.update(out);
        this.oHash.digestInto(out);
        this.destroy();
      }
      digest() {
        const out = new Uint8Array(this.oHash.outputLen);
        this.digestInto(out);
        return out;
      }
      _cloneInto(to) {
        to || (to = Object.create(Object.getPrototypeOf(this), {}));
        const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
        to = to;
        to.finished = finished;
        to.destroyed = destroyed;
        to.blockLen = blockLen;
        to.outputLen = outputLen;
        to.oHash = oHash._cloneInto(to.oHash);
        to.iHash = iHash._cloneInto(to.iHash);
        return to;
      }
      clone() {
        return this._cloneInto();
      }
      destroy() {
        this.destroyed = true;
        this.oHash.destroy();
        this.iHash.destroy();
      }
    };
    hmac = /* @__PURE__ */ __name((hash, key, message) => new HMAC(hash, key).update(message).digest(), "hmac");
    hmac.create = (hash, key) => new HMAC(hash, key);
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/cryptography/publickey.js
function bytesEqual(a, b) {
  if (a === b) return true;
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
function parseSerializedKeypairSignature(serializedSignature) {
  const bytes = fromBase64(serializedSignature);
  const signatureScheme = SIGNATURE_FLAG_TO_SCHEME[bytes[0]];
  switch (signatureScheme) {
    case "ED25519":
    case "Secp256k1":
    case "Secp256r1":
      const size = SIGNATURE_SCHEME_TO_SIZE[signatureScheme];
      const signature = bytes.slice(1, bytes.length - size);
      const publicKey = bytes.slice(1 + signature.length);
      return {
        serializedSignature,
        signatureScheme,
        signature,
        publicKey,
        bytes
      };
    default:
      throw new Error("Unsupported signature scheme");
  }
}
var PublicKey2;
var init_publickey = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/cryptography/publickey.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm3();
    init_blake2b();
    init_utils3();
    init_bcs3();
    init_sui_types();
    init_intent();
    init_signature_scheme();
    __name(bytesEqual, "bytesEqual");
    PublicKey2 = class {
      static {
        __name(this, "PublicKey");
      }
      /**
       * Checks if two public keys are equal
       */
      equals(publicKey) {
        return bytesEqual(this.toRawBytes(), publicKey.toRawBytes());
      }
      /**
       * Return the base-64 representation of the public key
       */
      toBase64() {
        return toBase64(this.toRawBytes());
      }
      toString() {
        throw new Error(
          "`toString` is not implemented on public keys. Use `toBase64()` or `toRawBytes()` instead."
        );
      }
      /**
       * Return the Sui representation of the public key encoded in
       * base-64. A Sui public key is formed by the concatenation
       * of the scheme flag with the raw bytes of the public key
       */
      toSuiPublicKey() {
        const bytes = this.toSuiBytes();
        return toBase64(bytes);
      }
      verifyWithIntent(bytes, signature, intent) {
        const intentMessage = messageWithIntent(intent, bytes);
        const digest = blake2b2(intentMessage, { dkLen: 32 });
        return this.verify(digest, signature);
      }
      /**
       * Verifies that the signature is valid for for the provided PersonalMessage
       */
      verifyPersonalMessage(message, signature) {
        return this.verifyWithIntent(
          suiBcs.byteVector().serialize(message).toBytes(),
          signature,
          "PersonalMessage"
        );
      }
      /**
       * Verifies that the signature is valid for for the provided Transaction
       */
      verifyTransaction(transaction, signature) {
        return this.verifyWithIntent(transaction, signature, "TransactionData");
      }
      /**
       * Verifies that the public key is associated with the provided address
       */
      verifyAddress(address) {
        return this.toSuiAddress() === address;
      }
      /**
       * Returns the bytes representation of the public key
       * prefixed with the signature scheme flag
       */
      toSuiBytes() {
        const rawBytes = this.toRawBytes();
        const suiBytes = new Uint8Array(rawBytes.length + 1);
        suiBytes.set([this.flag()]);
        suiBytes.set(rawBytes, 1);
        return suiBytes;
      }
      /**
       * Return the Sui address associated with this Ed25519 public key
       */
      toSuiAddress() {
        return normalizeSuiAddress(
          bytesToHex(blake2b2(this.toSuiBytes(), { dkLen: 32 })).slice(0, SUI_ADDRESS_LENGTH * 2)
        );
      }
    };
    __name(parseSerializedKeypairSignature, "parseSerializedKeypairSignature");
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/cryptography/signature.js
function toSerializedSignature({
  signature,
  signatureScheme,
  publicKey
}) {
  if (!publicKey) {
    throw new Error("`publicKey` is required");
  }
  const pubKeyBytes = publicKey.toRawBytes();
  const serializedSignature = new Uint8Array(1 + signature.length + pubKeyBytes.length);
  serializedSignature.set([SIGNATURE_SCHEME_TO_FLAG[signatureScheme]]);
  serializedSignature.set(signature, 1);
  serializedSignature.set(pubKeyBytes, 1 + signature.length);
  return toBase64(serializedSignature);
}
var init_signature = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/cryptography/signature.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm3();
    init_signature_scheme();
    __name(toSerializedSignature, "toSerializedSignature");
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/cryptography/keypair.js
function decodeSuiPrivateKey(value) {
  const { prefix, words } = bech32.decode(value);
  if (prefix !== SUI_PRIVATE_KEY_PREFIX) {
    throw new Error("invalid private key prefix");
  }
  const extendedSecretKey = new Uint8Array(bech32.fromWords(words));
  const secretKey = extendedSecretKey.slice(1);
  const signatureScheme = SIGNATURE_FLAG_TO_SCHEME[extendedSecretKey[0]];
  return {
    scheme: signatureScheme,
    schema: signatureScheme,
    secretKey
  };
}
function encodeSuiPrivateKey(bytes, scheme) {
  if (bytes.length !== PRIVATE_KEY_SIZE) {
    throw new Error("Invalid bytes length");
  }
  const flag = SIGNATURE_SCHEME_TO_FLAG[scheme];
  const privKeyBytes = new Uint8Array(bytes.length + 1);
  privKeyBytes.set([flag]);
  privKeyBytes.set(bytes, 1);
  return bech32.encode(SUI_PRIVATE_KEY_PREFIX, bech32.toWords(privKeyBytes));
}
var PRIVATE_KEY_SIZE, SUI_PRIVATE_KEY_PREFIX, Signer, Keypair;
var init_keypair = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/cryptography/keypair.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm3();
    init_blake2b();
    init_esm();
    init_intent();
    init_signature_scheme();
    init_signature();
    PRIVATE_KEY_SIZE = 32;
    SUI_PRIVATE_KEY_PREFIX = "suiprivkey";
    Signer = class {
      static {
        __name(this, "Signer");
      }
      /**
       * Sign messages with a specific intent. By combining the message bytes with the intent before hashing and signing,
       * it ensures that a signed message is tied to a specific purpose and domain separator is provided
       */
      async signWithIntent(bytes, intent) {
        const intentMessage = messageWithIntent(intent, bytes);
        const digest = blake2b2(intentMessage, { dkLen: 32 });
        const signature = toSerializedSignature({
          signature: await this.sign(digest),
          signatureScheme: this.getKeyScheme(),
          publicKey: this.getPublicKey()
        });
        return {
          signature,
          bytes: toBase64(bytes)
        };
      }
      /**
       * Signs provided transaction by calling `signWithIntent()` with a `TransactionData` provided as intent scope
       */
      async signTransaction(bytes) {
        return this.signWithIntent(bytes, "TransactionData");
      }
      /**
       * Signs provided personal message by calling `signWithIntent()` with a `PersonalMessage` provided as intent scope
       */
      async signPersonalMessage(bytes) {
        const { signature } = await this.signWithIntent(
          bcs.byteVector().serialize(bytes).toBytes(),
          "PersonalMessage"
        );
        return {
          bytes: toBase64(bytes),
          signature
        };
      }
      async signAndExecuteTransaction({
        transaction,
        client
      }) {
        const bytes = await transaction.build({ client });
        const { signature } = await this.signTransaction(bytes);
        const response = await client.core.executeTransaction({
          transaction: bytes,
          signatures: [signature]
        });
        return response.transaction;
      }
      toSuiAddress() {
        return this.getPublicKey().toSuiAddress();
      }
    };
    Keypair = class extends Signer {
      static {
        __name(this, "Keypair");
      }
    };
    __name(decodeSuiPrivateKey, "decodeSuiPrivateKey");
    __name(encodeSuiPrivateKey, "encodeSuiPrivateKey");
  }
});

// ../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/pbkdf2.js
function pbkdf2Init(hash, _password, _salt, _opts) {
  ahash(hash);
  const opts = checkOpts({ dkLen: 32, asyncTick: 10 }, _opts);
  const { c, dkLen, asyncTick } = opts;
  anumber2(c);
  anumber2(dkLen);
  anumber2(asyncTick);
  if (c < 1)
    throw new Error("iterations (c) should be >= 1");
  const password = kdfInputToBytes(_password);
  const salt = kdfInputToBytes(_salt);
  const DK = new Uint8Array(dkLen);
  const PRF = hmac.create(hash, password);
  const PRFSalt = PRF._cloneInto().update(salt);
  return { c, dkLen, asyncTick, DK, PRF, PRFSalt };
}
function pbkdf2Output(PRF, PRFSalt, DK, prfW, u) {
  PRF.destroy();
  PRFSalt.destroy();
  if (prfW)
    prfW.destroy();
  clean(u);
  return DK;
}
function pbkdf2(hash, password, salt, opts) {
  const { c, dkLen, DK, PRF, PRFSalt } = pbkdf2Init(hash, password, salt, opts);
  let prfW;
  const arr = new Uint8Array(4);
  const view = createView(arr);
  const u = new Uint8Array(PRF.outputLen);
  for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += PRF.outputLen) {
    const Ti = DK.subarray(pos, pos + PRF.outputLen);
    view.setInt32(0, ti, false);
    (prfW = PRFSalt._cloneInto(prfW)).update(arr).digestInto(u);
    Ti.set(u.subarray(0, Ti.length));
    for (let ui = 1; ui < c; ui++) {
      PRF._cloneInto(prfW).update(u).digestInto(u);
      for (let i = 0; i < Ti.length; i++)
        Ti[i] ^= u[i];
    }
  }
  return pbkdf2Output(PRF, PRFSalt, DK, prfW, u);
}
var init_pbkdf2 = __esm({
  "../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/pbkdf2.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_hmac();
    init_utils3();
    __name(pbkdf2Init, "pbkdf2Init");
    __name(pbkdf2Output, "pbkdf2Output");
    __name(pbkdf2, "pbkdf2");
  }
});

// ../../node_modules/.pnpm/@scure+bip39@1.6.0/node_modules/@scure/bip39/esm/index.js
function nfkd(str) {
  if (typeof str !== "string")
    throw new TypeError("invalid mnemonic type: " + typeof str);
  return str.normalize("NFKD");
}
function normalize(str) {
  const norm = nfkd(str);
  const words = norm.split(" ");
  if (![12, 15, 18, 21, 24].includes(words.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: norm, words };
}
function mnemonicToSeedSync(mnemonic, passphrase = "") {
  return pbkdf2(sha512, normalize(mnemonic).nfkd, psalt(passphrase), { c: 2048, dkLen: 64 });
}
var psalt;
var init_esm4 = __esm({
  "../../node_modules/.pnpm/@scure+bip39@1.6.0/node_modules/@scure/bip39/esm/index.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_pbkdf2();
    init_sha2();
    __name(nfkd, "nfkd");
    __name(normalize, "normalize");
    psalt = /* @__PURE__ */ __name((passphrase) => nfkd("mnemonic" + passphrase), "psalt");
    __name(mnemonicToSeedSync, "mnemonicToSeedSync");
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/cryptography/mnemonics.js
function isValidHardenedPath(path) {
  if (!new RegExp("^m\\/44'\\/784'\\/[0-9]+'\\/[0-9]+'\\/[0-9]+'+$").test(path)) {
    return false;
  }
  return true;
}
function mnemonicToSeed(mnemonics) {
  return mnemonicToSeedSync(mnemonics, "");
}
function mnemonicToSeedHex(mnemonics) {
  return toHex(mnemonicToSeed(mnemonics));
}
var init_mnemonics = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/cryptography/mnemonics.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm3();
    init_esm4();
    __name(isValidHardenedPath, "isValidHardenedPath");
    __name(mnemonicToSeed, "mnemonicToSeed");
    __name(mnemonicToSeedHex, "mnemonicToSeedHex");
  }
});

// ../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/sha512.js
var sha5122;
var init_sha512 = __esm({
  "../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/sha512.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_sha2();
    sha5122 = sha512;
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/keypairs/ed25519/ed25519-hd-key.js
var ED25519_CURVE, HARDENED_OFFSET, pathRegex, replaceDerive, getMasterKeyFromSeed, CKDPriv, isValidPath, derivePath;
var init_ed25519_hd_key = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/keypairs/ed25519/ed25519-hd-key.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm3();
    init_hmac();
    init_sha512();
    ED25519_CURVE = "ed25519 seed";
    HARDENED_OFFSET = 2147483648;
    pathRegex = new RegExp("^m(\\/[0-9]+')+$");
    replaceDerive = /* @__PURE__ */ __name((val) => val.replace("'", ""), "replaceDerive");
    getMasterKeyFromSeed = /* @__PURE__ */ __name((seed) => {
      const h = hmac.create(sha5122, ED25519_CURVE);
      const I = h.update(fromHex(seed)).digest();
      const IL = I.slice(0, 32);
      const IR = I.slice(32);
      return {
        key: IL,
        chainCode: IR
      };
    }, "getMasterKeyFromSeed");
    CKDPriv = /* @__PURE__ */ __name(({ key, chainCode }, index) => {
      const indexBuffer = new ArrayBuffer(4);
      const cv = new DataView(indexBuffer);
      cv.setUint32(0, index);
      const data = new Uint8Array(1 + key.length + indexBuffer.byteLength);
      data.set(new Uint8Array(1).fill(0));
      data.set(key, 1);
      data.set(new Uint8Array(indexBuffer, 0, indexBuffer.byteLength), key.length + 1);
      const I = hmac.create(sha5122, chainCode).update(data).digest();
      const IL = I.slice(0, 32);
      const IR = I.slice(32);
      return {
        key: IL,
        chainCode: IR
      };
    }, "CKDPriv");
    isValidPath = /* @__PURE__ */ __name((path) => {
      if (!pathRegex.test(path)) {
        return false;
      }
      return !path.split("/").slice(1).map(replaceDerive).some(
        isNaN
        /* ts T_T*/
      );
    }, "isValidPath");
    derivePath = /* @__PURE__ */ __name((path, seed, offset = HARDENED_OFFSET) => {
      if (!isValidPath(path)) {
        throw new Error("Invalid derivation path");
      }
      const { key, chainCode } = getMasterKeyFromSeed(seed);
      const segments = path.split("/").slice(1).map(replaceDerive).map((el) => parseInt(el, 10));
      return segments.reduce((parentKeys, segment) => CKDPriv(parentKeys, segment + offset), {
        key,
        chainCode
      });
    }, "derivePath");
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/keypairs/ed25519/publickey.js
var PUBLIC_KEY_SIZE, Ed25519PublicKey;
var init_publickey2 = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/keypairs/ed25519/publickey.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_esm3();
    init_ed25519();
    init_publickey();
    init_signature_scheme();
    PUBLIC_KEY_SIZE = 32;
    Ed25519PublicKey = class extends PublicKey2 {
      static {
        __name(this, "Ed25519PublicKey");
      }
      /**
       * Create a new Ed25519PublicKey object
       * @param value ed25519 public key as buffer or base-64 encoded string
       */
      constructor(value) {
        super();
        if (typeof value === "string") {
          this.data = fromBase64(value);
        } else if (value instanceof Uint8Array) {
          this.data = value;
        } else {
          this.data = Uint8Array.from(value);
        }
        if (this.data.length !== PUBLIC_KEY_SIZE) {
          throw new Error(
            `Invalid public key input. Expected ${PUBLIC_KEY_SIZE} bytes, got ${this.data.length}`
          );
        }
      }
      /**
       * Checks if two Ed25519 public keys are equal
       */
      equals(publicKey) {
        return super.equals(publicKey);
      }
      /**
       * Return the byte array representation of the Ed25519 public key
       */
      toRawBytes() {
        return this.data;
      }
      /**
       * Return the Sui address associated with this Ed25519 public key
       */
      flag() {
        return SIGNATURE_SCHEME_TO_FLAG["ED25519"];
      }
      /**
       * Verifies that the signature is valid for for the provided message
       */
      async verify(message, signature) {
        let bytes;
        if (typeof signature === "string") {
          const parsed = parseSerializedKeypairSignature(signature);
          if (parsed.signatureScheme !== "ED25519") {
            throw new Error("Invalid signature scheme");
          }
          if (!bytesEqual(this.toRawBytes(), parsed.publicKey)) {
            throw new Error("Signature does not match public key");
          }
          bytes = parsed.signature;
        } else {
          bytes = signature;
        }
        return ed25519.verify(bytes, message, this.toRawBytes());
      }
    };
    Ed25519PublicKey.SIZE = PUBLIC_KEY_SIZE;
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/keypairs/ed25519/keypair.js
var DEFAULT_ED25519_DERIVATION_PATH, Ed25519Keypair;
var init_keypair2 = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/keypairs/ed25519/keypair.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_ed25519();
    init_keypair();
    init_mnemonics();
    init_ed25519_hd_key();
    init_publickey2();
    DEFAULT_ED25519_DERIVATION_PATH = "m/44'/784'/0'/0'/0'";
    Ed25519Keypair = class _Ed25519Keypair extends Keypair {
      static {
        __name(this, "Ed25519Keypair");
      }
      /**
       * Create a new Ed25519 keypair instance.
       * Generate random keypair if no {@link Ed25519Keypair} is provided.
       *
       * @param keypair Ed25519 keypair
       */
      constructor(keypair) {
        super();
        if (keypair) {
          this.keypair = {
            publicKey: keypair.publicKey,
            secretKey: keypair.secretKey.slice(0, 32)
          };
        } else {
          const privateKey = ed25519.utils.randomPrivateKey();
          this.keypair = {
            publicKey: ed25519.getPublicKey(privateKey),
            secretKey: privateKey
          };
        }
      }
      /**
       * Get the key scheme of the keypair ED25519
       */
      getKeyScheme() {
        return "ED25519";
      }
      /**
       * Generate a new random Ed25519 keypair
       */
      static generate() {
        const secretKey = ed25519.utils.randomPrivateKey();
        return new _Ed25519Keypair({
          publicKey: ed25519.getPublicKey(secretKey),
          secretKey
        });
      }
      /**
       * Create a Ed25519 keypair from a raw secret key byte array, also known as seed.
       * This is NOT the private scalar which is result of hashing and bit clamping of
       * the raw secret key.
       *
       * @throws error if the provided secret key is invalid and validation is not skipped.
       *
       * @param secretKey secret key as a byte array or Bech32 secret key string
       * @param options: skip secret key validation
       */
      static fromSecretKey(secretKey, options) {
        if (typeof secretKey === "string") {
          const decoded = decodeSuiPrivateKey(secretKey);
          if (decoded.schema !== "ED25519") {
            throw new Error(`Expected a ED25519 keypair, got ${decoded.schema}`);
          }
          return this.fromSecretKey(decoded.secretKey, options);
        }
        const secretKeyLength = secretKey.length;
        if (secretKeyLength !== PRIVATE_KEY_SIZE) {
          throw new Error(
            `Wrong secretKey size. Expected ${PRIVATE_KEY_SIZE} bytes, got ${secretKeyLength}.`
          );
        }
        const keypair = {
          publicKey: ed25519.getPublicKey(secretKey),
          secretKey
        };
        if (!options || !options.skipValidation) {
          const encoder = new TextEncoder();
          const signData = encoder.encode("sui validation");
          const signature = ed25519.sign(signData, secretKey);
          if (!ed25519.verify(signature, signData, keypair.publicKey)) {
            throw new Error("provided secretKey is invalid");
          }
        }
        return new _Ed25519Keypair(keypair);
      }
      /**
       * The public key for this Ed25519 keypair
       */
      getPublicKey() {
        return new Ed25519PublicKey(this.keypair.publicKey);
      }
      /**
       * The Bech32 secret key string for this Ed25519 keypair
       */
      getSecretKey() {
        return encodeSuiPrivateKey(
          this.keypair.secretKey.slice(0, PRIVATE_KEY_SIZE),
          this.getKeyScheme()
        );
      }
      /**
       * Return the signature for the provided data using Ed25519.
       */
      async sign(data) {
        return ed25519.sign(data, this.keypair.secretKey);
      }
      /**
       * Derive Ed25519 keypair from mnemonics and path. The mnemonics must be normalized
       * and validated against the english wordlist.
       *
       * If path is none, it will default to m/44'/784'/0'/0'/0', otherwise the path must
       * be compliant to SLIP-0010 in form m/44'/784'/{account_index}'/{change_index}'/{address_index}'.
       */
      static deriveKeypair(mnemonics, path) {
        if (path == null) {
          path = DEFAULT_ED25519_DERIVATION_PATH;
        }
        if (!isValidHardenedPath(path)) {
          throw new Error("Invalid derivation path");
        }
        const { key } = derivePath(path, mnemonicToSeedHex(mnemonics));
        return _Ed25519Keypair.fromSecretKey(key);
      }
      /**
       * Derive Ed25519 keypair from mnemonicSeed and path.
       *
       * If path is none, it will default to m/44'/784'/0'/0'/0', otherwise the path must
       * be compliant to SLIP-0010 in form m/44'/784'/{account_index}'/{change_index}'/{address_index}'.
       */
      static deriveKeypairFromSeed(seedHex, path) {
        if (path == null) {
          path = DEFAULT_ED25519_DERIVATION_PATH;
        }
        if (!isValidHardenedPath(path)) {
          throw new Error("Invalid derivation path");
        }
        const { key } = derivePath(path, seedHex);
        return _Ed25519Keypair.fromSecretKey(key);
      }
    };
  }
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/keypairs/ed25519/index.js
var ed25519_exports = {};
__export(ed25519_exports, {
  DEFAULT_ED25519_DERIVATION_PATH: () => DEFAULT_ED25519_DERIVATION_PATH,
  Ed25519Keypair: () => Ed25519Keypair,
  Ed25519PublicKey: () => Ed25519PublicKey
});
var init_ed255192 = __esm({
  "../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/keypairs/ed25519/index.js"() {
    init_modules_watch_stub();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_keypair2();
    init_publickey2();
  }
});

// .wrangler/tmp/bundle-wcLhdT/middleware-loader.entry.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// .wrangler/tmp/bundle-wcLhdT/middleware-insertion-facade.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// src/index.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// src/gasStationDO.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/client/index.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/jsonRpc/http-transport.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_version();

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/jsonRpc/errors.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var CODE_TO_ERROR_TYPE = {
  "-32700": "ParseError",
  "-32701": "OversizedRequest",
  "-32702": "OversizedResponse",
  "-32600": "InvalidRequest",
  "-32601": "MethodNotFound",
  "-32602": "InvalidParams",
  "-32603": "InternalError",
  "-32604": "ServerBusy",
  "-32000": "CallExecutionFailed",
  "-32001": "UnknownError",
  "-32003": "SubscriptionClosed",
  "-32004": "SubscriptionClosedWithError",
  "-32005": "BatchesNotSupported",
  "-32006": "TooManySubscriptions",
  "-32050": "TransientError",
  "-32002": "TransactionExecutionClientError"
};
var SuiHTTPTransportError = class extends Error {
  static {
    __name(this, "SuiHTTPTransportError");
  }
};
var JsonRpcError = class extends SuiHTTPTransportError {
  static {
    __name(this, "JsonRpcError");
  }
  constructor(message, code) {
    super(message);
    this.code = code;
    this.type = CODE_TO_ERROR_TYPE[code] ?? "ServerError";
  }
};
var SuiHTTPStatusError = class extends SuiHTTPTransportError {
  static {
    __name(this, "SuiHTTPStatusError");
  }
  constructor(message, status, statusText) {
    super(message);
    this.status = status;
    this.statusText = statusText;
  }
};

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/jsonRpc/rpc-websocket-client.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var __typeError = /* @__PURE__ */ __name((msg) => {
  throw TypeError(msg);
}, "__typeError");
var __accessCheck = /* @__PURE__ */ __name((obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg), "__accessCheck");
var __privateGet = /* @__PURE__ */ __name((obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj)), "__privateGet");
var __privateAdd = /* @__PURE__ */ __name((obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value), "__privateAdd");
var __privateSet = /* @__PURE__ */ __name((obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value), "__privateSet");
var __privateMethod = /* @__PURE__ */ __name((obj, member, method) => (__accessCheck(obj, member, "access private method"), method), "__privateMethod");
var __privateWrapper = /* @__PURE__ */ __name((obj, member, setter, getter) => ({
  set _(value) {
    __privateSet(obj, member, value, setter);
  },
  get _() {
    return __privateGet(obj, member, getter);
  }
}), "__privateWrapper");
var _requestId;
var _disconnects;
var _webSocket;
var _connectionPromise;
var _subscriptions;
var _pendingRequests;
var _WebsocketClient_instances;
var setupWebSocket_fn;
var reconnect_fn;
function getWebsocketUrl(httpUrl) {
  const url = new URL(httpUrl);
  url.protocol = url.protocol.replace("http", "ws");
  return url.toString();
}
__name(getWebsocketUrl, "getWebsocketUrl");
var DEFAULT_CLIENT_OPTIONS = {
  // We fudge the typing because we also check for undefined in the constructor:
  WebSocketConstructor: typeof WebSocket !== "undefined" ? WebSocket : void 0,
  callTimeout: 3e4,
  reconnectTimeout: 3e3,
  maxReconnects: 5
};
var WebsocketClient = class {
  static {
    __name(this, "WebsocketClient");
  }
  constructor(endpoint, options = {}) {
    __privateAdd(this, _WebsocketClient_instances);
    __privateAdd(this, _requestId, 0);
    __privateAdd(this, _disconnects, 0);
    __privateAdd(this, _webSocket, null);
    __privateAdd(this, _connectionPromise, null);
    __privateAdd(this, _subscriptions, /* @__PURE__ */ new Set());
    __privateAdd(this, _pendingRequests, /* @__PURE__ */ new Map());
    this.endpoint = endpoint;
    this.options = { ...DEFAULT_CLIENT_OPTIONS, ...options };
    if (!this.options.WebSocketConstructor) {
      throw new Error("Missing WebSocket constructor");
    }
    if (this.endpoint.startsWith("http")) {
      this.endpoint = getWebsocketUrl(this.endpoint);
    }
  }
  async makeRequest(method, params, signal) {
    const webSocket = await __privateMethod(this, _WebsocketClient_instances, setupWebSocket_fn).call(this);
    return new Promise((resolve, reject) => {
      __privateSet(this, _requestId, __privateGet(this, _requestId) + 1);
      __privateGet(this, _pendingRequests).set(__privateGet(this, _requestId), {
        resolve,
        reject,
        timeout: setTimeout(() => {
          __privateGet(this, _pendingRequests).delete(__privateGet(this, _requestId));
          reject(new Error(`Request timeout: ${method}`));
        }, this.options.callTimeout)
      });
      signal?.addEventListener("abort", () => {
        __privateGet(this, _pendingRequests).delete(__privateGet(this, _requestId));
        reject(signal.reason);
      });
      webSocket.send(JSON.stringify({ jsonrpc: "2.0", id: __privateGet(this, _requestId), method, params }));
    }).then(({ error: error3, result }) => {
      if (error3) {
        throw new JsonRpcError(error3.message, error3.code);
      }
      return result;
    });
  }
  async subscribe(input) {
    const subscription = new RpcSubscription(input);
    __privateGet(this, _subscriptions).add(subscription);
    await subscription.subscribe(this);
    return () => subscription.unsubscribe(this);
  }
};
_requestId = /* @__PURE__ */ new WeakMap();
_disconnects = /* @__PURE__ */ new WeakMap();
_webSocket = /* @__PURE__ */ new WeakMap();
_connectionPromise = /* @__PURE__ */ new WeakMap();
_subscriptions = /* @__PURE__ */ new WeakMap();
_pendingRequests = /* @__PURE__ */ new WeakMap();
_WebsocketClient_instances = /* @__PURE__ */ new WeakSet();
setupWebSocket_fn = /* @__PURE__ */ __name(function() {
  if (__privateGet(this, _connectionPromise)) {
    return __privateGet(this, _connectionPromise);
  }
  __privateSet(this, _connectionPromise, new Promise((resolve) => {
    __privateGet(this, _webSocket)?.close();
    __privateSet(this, _webSocket, new this.options.WebSocketConstructor(this.endpoint));
    __privateGet(this, _webSocket).addEventListener("open", () => {
      __privateSet(this, _disconnects, 0);
      resolve(__privateGet(this, _webSocket));
    });
    __privateGet(this, _webSocket).addEventListener("close", () => {
      __privateWrapper(this, _disconnects)._++;
      if (__privateGet(this, _disconnects) <= this.options.maxReconnects) {
        setTimeout(() => {
          __privateMethod(this, _WebsocketClient_instances, reconnect_fn).call(this);
        }, this.options.reconnectTimeout);
      }
    });
    __privateGet(this, _webSocket).addEventListener("message", ({ data }) => {
      let json;
      try {
        json = JSON.parse(data);
      } catch (error3) {
        console.error(new Error(`Failed to parse RPC message: ${data}`, { cause: error3 }));
        return;
      }
      if ("id" in json && json.id != null && __privateGet(this, _pendingRequests).has(json.id)) {
        const { resolve: resolve2, timeout } = __privateGet(this, _pendingRequests).get(json.id);
        clearTimeout(timeout);
        resolve2(json);
      } else if ("params" in json) {
        const { params } = json;
        __privateGet(this, _subscriptions).forEach((subscription) => {
          if (subscription.subscriptionId === params.subscription) {
            if (params.subscription === subscription.subscriptionId) {
              subscription.onMessage(params.result);
            }
          }
        });
      }
    });
  }));
  return __privateGet(this, _connectionPromise);
}, "setupWebSocket_fn");
reconnect_fn = /* @__PURE__ */ __name(async function() {
  __privateGet(this, _webSocket)?.close();
  __privateSet(this, _connectionPromise, null);
  return Promise.allSettled(
    [...__privateGet(this, _subscriptions)].map((subscription) => subscription.subscribe(this))
  );
}, "reconnect_fn");
var RpcSubscription = class {
  static {
    __name(this, "RpcSubscription");
  }
  constructor(input) {
    this.subscriptionId = null;
    this.subscribed = false;
    this.input = input;
  }
  onMessage(message) {
    if (this.subscribed) {
      this.input.onMessage(message);
    }
  }
  async unsubscribe(client) {
    const { subscriptionId } = this;
    this.subscribed = false;
    if (subscriptionId == null) return false;
    this.subscriptionId = null;
    return client.makeRequest(this.input.unsubscribe, [subscriptionId]);
  }
  async subscribe(client) {
    this.subscriptionId = null;
    this.subscribed = true;
    const newSubscriptionId = await client.makeRequest(
      this.input.method,
      this.input.params,
      this.input.signal
    );
    if (this.subscribed) {
      this.subscriptionId = newSubscriptionId;
    }
  }
};

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/jsonRpc/http-transport.js
var __typeError2 = /* @__PURE__ */ __name((msg) => {
  throw TypeError(msg);
}, "__typeError");
var __accessCheck2 = /* @__PURE__ */ __name((obj, member, msg) => member.has(obj) || __typeError2("Cannot " + msg), "__accessCheck");
var __privateGet2 = /* @__PURE__ */ __name((obj, member, getter) => (__accessCheck2(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj)), "__privateGet");
var __privateAdd2 = /* @__PURE__ */ __name((obj, member, value) => member.has(obj) ? __typeError2("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value), "__privateAdd");
var __privateSet2 = /* @__PURE__ */ __name((obj, member, value, setter) => (__accessCheck2(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value), "__privateSet");
var __privateMethod2 = /* @__PURE__ */ __name((obj, member, method) => (__accessCheck2(obj, member, "access private method"), method), "__privateMethod");
var _requestId2;
var _options;
var _websocketClient;
var _JsonRpcHTTPTransport_instances;
var getWebsocketClient_fn;
var JsonRpcHTTPTransport = class {
  static {
    __name(this, "JsonRpcHTTPTransport");
  }
  constructor(options) {
    __privateAdd2(this, _JsonRpcHTTPTransport_instances);
    __privateAdd2(this, _requestId2, 0);
    __privateAdd2(this, _options);
    __privateAdd2(this, _websocketClient);
    __privateSet2(this, _options, options);
  }
  fetch(input, init) {
    const fetchFn = __privateGet2(this, _options).fetch ?? fetch;
    if (!fetchFn) {
      throw new Error(
        "The current environment does not support fetch, you can provide a fetch implementation in the options for SuiHTTPTransport."
      );
    }
    return fetchFn(input, init);
  }
  async request(input) {
    __privateSet2(this, _requestId2, __privateGet2(this, _requestId2) + 1);
    const res = await this.fetch(__privateGet2(this, _options).rpc?.url ?? __privateGet2(this, _options).url, {
      method: "POST",
      signal: input.signal,
      headers: {
        "Content-Type": "application/json",
        "Client-Sdk-Type": "typescript",
        "Client-Sdk-Version": PACKAGE_VERSION,
        "Client-Target-Api-Version": TARGETED_RPC_VERSION,
        "Client-Request-Method": input.method,
        ...__privateGet2(this, _options).rpc?.headers
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: __privateGet2(this, _requestId2),
        method: input.method,
        params: input.params
      })
    });
    if (!res.ok) {
      throw new SuiHTTPStatusError(
        `Unexpected status code: ${res.status}`,
        res.status,
        res.statusText
      );
    }
    const data = await res.json();
    if ("error" in data && data.error != null) {
      throw new JsonRpcError(data.error.message, data.error.code);
    }
    return data.result;
  }
  async subscribe(input) {
    const unsubscribe = await __privateMethod2(this, _JsonRpcHTTPTransport_instances, getWebsocketClient_fn).call(this).subscribe(input);
    if (input.signal) {
      input.signal.throwIfAborted();
      input.signal.addEventListener("abort", () => {
        unsubscribe();
      });
    }
    return async () => !!await unsubscribe();
  }
};
_requestId2 = /* @__PURE__ */ new WeakMap();
_options = /* @__PURE__ */ new WeakMap();
_websocketClient = /* @__PURE__ */ new WeakMap();
_JsonRpcHTTPTransport_instances = /* @__PURE__ */ new WeakSet();
getWebsocketClient_fn = /* @__PURE__ */ __name(function() {
  if (!__privateGet2(this, _websocketClient)) {
    const WebSocketConstructor = __privateGet2(this, _options).WebSocketConstructor ?? WebSocket;
    if (!WebSocketConstructor) {
      throw new Error(
        "The current environment does not support WebSocket, you can provide a WebSocketConstructor in the options for SuiHTTPTransport."
      );
    }
    __privateSet2(this, _websocketClient, new WebsocketClient(
      __privateGet2(this, _options).websocket?.url ?? __privateGet2(this, _options).url,
      {
        WebSocketConstructor,
        ...__privateGet2(this, _options).websocket
      }
    ));
  }
  return __privateGet2(this, _websocketClient);
}, "getWebsocketClient_fn");

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/jsonRpc/client.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_esm3();
init_client();

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/Transaction.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_esm3();
init_dist();
init_sui_types();

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/Commands.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_esm3();
init_dist();
init_sui_types();
init_internal();
var Commands = {
  MoveCall(input) {
    const [pkg, mod2 = "", fn = ""] = "target" in input ? input.target.split("::") : [input.package, input.module, input.function];
    return {
      $kind: "MoveCall",
      MoveCall: {
        package: pkg,
        module: mod2,
        function: fn,
        typeArguments: input.typeArguments ?? [],
        arguments: input.arguments ?? []
      }
    };
  },
  TransferObjects(objects, address) {
    return {
      $kind: "TransferObjects",
      TransferObjects: {
        objects: objects.map((o) => parse(ArgumentSchema, o)),
        address: parse(ArgumentSchema, address)
      }
    };
  },
  SplitCoins(coin, amounts) {
    return {
      $kind: "SplitCoins",
      SplitCoins: {
        coin: parse(ArgumentSchema, coin),
        amounts: amounts.map((o) => parse(ArgumentSchema, o))
      }
    };
  },
  MergeCoins(destination, sources) {
    return {
      $kind: "MergeCoins",
      MergeCoins: {
        destination: parse(ArgumentSchema, destination),
        sources: sources.map((o) => parse(ArgumentSchema, o))
      }
    };
  },
  Publish({
    modules,
    dependencies
  }) {
    return {
      $kind: "Publish",
      Publish: {
        modules: modules.map(
          (module) => typeof module === "string" ? module : toBase64(new Uint8Array(module))
        ),
        dependencies: dependencies.map((dep) => normalizeSuiObjectId(dep))
      }
    };
  },
  Upgrade({
    modules,
    dependencies,
    package: packageId,
    ticket
  }) {
    return {
      $kind: "Upgrade",
      Upgrade: {
        modules: modules.map(
          (module) => typeof module === "string" ? module : toBase64(new Uint8Array(module))
        ),
        dependencies: dependencies.map((dep) => normalizeSuiObjectId(dep)),
        package: packageId,
        ticket: parse(ArgumentSchema, ticket)
      }
    };
  },
  MakeMoveVec({
    type,
    elements
  }) {
    return {
      $kind: "MakeMoveVec",
      MakeMoveVec: {
        type: type ?? null,
        elements: elements.map((o) => parse(ArgumentSchema, o))
      }
    };
  },
  Intent({
    name,
    inputs = {},
    data = {}
  }) {
    return {
      $kind: "$Intent",
      $Intent: {
        name,
        inputs: Object.fromEntries(
          Object.entries(inputs).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.map((o) => parse(ArgumentSchema, o)) : parse(ArgumentSchema, value)
          ])
        ),
        data
      }
    };
  }
};

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/Transaction.js
init_internal();
init_v1();

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/data/v2.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_dist();
init_internal();
function enumUnion(options) {
  return union(
    Object.entries(options).map(([key, value]) => object({ [key]: value }))
  );
}
__name(enumUnion, "enumUnion");
var Argument2 = enumUnion({
  GasCoin: literal(true),
  Input: pipe(number(), integer()),
  Result: pipe(number(), integer()),
  NestedResult: tuple([pipe(number(), integer()), pipe(number(), integer())])
});
var GasData2 = object({
  budget: nullable(JsonU64),
  price: nullable(JsonU64),
  owner: nullable(SuiAddress),
  payment: nullable(array(ObjectRefSchema))
});
var ProgrammableMoveCall2 = object({
  package: ObjectID,
  module: string(),
  function: string(),
  // snake case in rust
  typeArguments: array(string()),
  arguments: array(Argument2)
});
var $Intent2 = object({
  name: string(),
  inputs: record(string(), union([Argument2, array(Argument2)])),
  data: record(string(), unknown())
});
var Command2 = enumUnion({
  MoveCall: ProgrammableMoveCall2,
  TransferObjects: object({
    objects: array(Argument2),
    address: Argument2
  }),
  SplitCoins: object({
    coin: Argument2,
    amounts: array(Argument2)
  }),
  MergeCoins: object({
    destination: Argument2,
    sources: array(Argument2)
  }),
  Publish: object({
    modules: array(BCSBytes),
    dependencies: array(ObjectID)
  }),
  MakeMoveVec: object({
    type: nullable(string()),
    elements: array(Argument2)
  }),
  Upgrade: object({
    modules: array(BCSBytes),
    dependencies: array(ObjectID),
    package: ObjectID,
    ticket: Argument2
  }),
  $Intent: $Intent2
});
var ObjectArg3 = enumUnion({
  ImmOrOwnedObject: ObjectRefSchema,
  SharedObject: object({
    objectId: ObjectID,
    // snake case in rust
    initialSharedVersion: JsonU64,
    mutable: boolean()
  }),
  Receiving: ObjectRefSchema
});
var CallArg2 = enumUnion({
  Object: ObjectArg3,
  Pure: object({
    bytes: BCSBytes
  }),
  UnresolvedPure: object({
    value: unknown()
  }),
  UnresolvedObject: object({
    objectId: ObjectID,
    version: optional(nullable(JsonU64)),
    digest: optional(nullable(string())),
    initialSharedVersion: optional(nullable(JsonU64)),
    mutable: optional(nullable(boolean()))
  })
});
var TransactionExpiration4 = enumUnion({
  None: literal(true),
  Epoch: JsonU64
});
var SerializedTransactionDataV2Schema = object({
  version: literal(2),
  sender: nullish(SuiAddress),
  expiration: nullish(TransactionExpiration4),
  gasData: GasData2,
  inputs: array(CallArg2),
  commands: array(Command2),
  digest: optional(nullable(string()))
});

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/Inputs.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_esm3();
init_sui_types();
function Pure(data) {
  return {
    $kind: "Pure",
    Pure: {
      bytes: data instanceof Uint8Array ? toBase64(data) : data.toBase64()
    }
  };
}
__name(Pure, "Pure");
var Inputs = {
  Pure,
  ObjectRef({ objectId, digest, version: version2 }) {
    return {
      $kind: "Object",
      Object: {
        $kind: "ImmOrOwnedObject",
        ImmOrOwnedObject: {
          digest,
          version: version2,
          objectId: normalizeSuiAddress(objectId)
        }
      }
    };
  },
  SharedObjectRef({
    objectId,
    mutable,
    initialSharedVersion
  }) {
    return {
      $kind: "Object",
      Object: {
        $kind: "SharedObject",
        SharedObject: {
          mutable,
          initialSharedVersion,
          objectId: normalizeSuiAddress(objectId)
        }
      }
    };
  },
  ReceivingRef({ objectId, digest, version: version2 }) {
    return {
      $kind: "Object",
      Object: {
        $kind: "Receiving",
        Receiving: {
          digest,
          version: version2,
          objectId: normalizeSuiAddress(objectId)
        }
      }
    };
  }
};

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/resolve.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_bcs3();

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/jsonRpc/json-rpc-resolver.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_dist();

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/utils/index.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_sui_types();

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/utils/constants.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_sui_types();
var MIST_PER_SUI = BigInt(1e9);
var MOVE_STDLIB_ADDRESS = "0x1";
var SUI_FRAMEWORK_ADDRESS = "0x2";
var SUI_CLOCK_OBJECT_ID = normalizeSuiObjectId("0x6");
var SUI_TYPE_ARG = `${SUI_FRAMEWORK_ADDRESS}::sui::SUI`;
var SUI_SYSTEM_STATE_OBJECT_ID = normalizeSuiObjectId("0x5");
var SUI_RANDOM_OBJECT_ID = normalizeSuiObjectId("0x8");

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/jsonRpc/json-rpc-resolver.js
init_internal();

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/serializer.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_bcs3();
init_sui_types();
var OBJECT_MODULE_NAME = "object";
var ID_STRUCT_NAME = "ID";
var STD_ASCII_MODULE_NAME = "ascii";
var STD_ASCII_STRUCT_NAME = "String";
var STD_UTF8_MODULE_NAME = "string";
var STD_UTF8_STRUCT_NAME = "String";
var STD_OPTION_MODULE_NAME = "option";
var STD_OPTION_STRUCT_NAME = "Option";
function isTxContext(param) {
  const struct = typeof param.body === "object" && "datatype" in param.body ? param.body.datatype : null;
  return !!struct && normalizeSuiAddress(struct.package) === normalizeSuiAddress("0x2") && struct.module === "tx_context" && struct.type === "TxContext";
}
__name(isTxContext, "isTxContext");
function getPureBcsSchema(typeSignature) {
  if (typeof typeSignature === "string") {
    switch (typeSignature) {
      case "address":
        return suiBcs.Address;
      case "bool":
        return suiBcs.Bool;
      case "u8":
        return suiBcs.U8;
      case "u16":
        return suiBcs.U16;
      case "u32":
        return suiBcs.U32;
      case "u64":
        return suiBcs.U64;
      case "u128":
        return suiBcs.U128;
      case "u256":
        return suiBcs.U256;
      default:
        throw new Error(`Unknown type signature ${typeSignature}`);
    }
  }
  if ("vector" in typeSignature) {
    if (typeSignature.vector === "u8") {
      return suiBcs.byteVector().transform({
        input: /* @__PURE__ */ __name((val) => typeof val === "string" ? new TextEncoder().encode(val) : val, "input"),
        output: /* @__PURE__ */ __name((val) => val, "output")
      });
    }
    const type = getPureBcsSchema(typeSignature.vector);
    return type ? suiBcs.vector(type) : null;
  }
  if ("datatype" in typeSignature) {
    const pkg = normalizeSuiAddress(typeSignature.datatype.package);
    if (pkg === normalizeSuiAddress(MOVE_STDLIB_ADDRESS)) {
      if (typeSignature.datatype.module === STD_ASCII_MODULE_NAME && typeSignature.datatype.type === STD_ASCII_STRUCT_NAME) {
        return suiBcs.String;
      }
      if (typeSignature.datatype.module === STD_UTF8_MODULE_NAME && typeSignature.datatype.type === STD_UTF8_STRUCT_NAME) {
        return suiBcs.String;
      }
      if (typeSignature.datatype.module === STD_OPTION_MODULE_NAME && typeSignature.datatype.type === STD_OPTION_STRUCT_NAME) {
        const type = getPureBcsSchema(typeSignature.datatype.typeParameters[0]);
        return type ? suiBcs.vector(type) : null;
      }
    }
    if (pkg === normalizeSuiAddress(SUI_FRAMEWORK_ADDRESS) && typeSignature.datatype.module === OBJECT_MODULE_NAME && typeSignature.datatype.type === ID_STRUCT_NAME) {
      return suiBcs.Address;
    }
  }
  return null;
}
__name(getPureBcsSchema, "getPureBcsSchema");
function normalizedTypeToMoveTypeSignature(type) {
  if (typeof type === "object" && "Reference" in type) {
    return {
      ref: "&",
      body: normalizedTypeToMoveTypeSignatureBody(type.Reference)
    };
  }
  if (typeof type === "object" && "MutableReference" in type) {
    return {
      ref: "&mut",
      body: normalizedTypeToMoveTypeSignatureBody(type.MutableReference)
    };
  }
  return {
    ref: null,
    body: normalizedTypeToMoveTypeSignatureBody(type)
  };
}
__name(normalizedTypeToMoveTypeSignature, "normalizedTypeToMoveTypeSignature");
function normalizedTypeToMoveTypeSignatureBody(type) {
  if (typeof type === "string") {
    switch (type) {
      case "Address":
        return "address";
      case "Bool":
        return "bool";
      case "U8":
        return "u8";
      case "U16":
        return "u16";
      case "U32":
        return "u32";
      case "U64":
        return "u64";
      case "U128":
        return "u128";
      case "U256":
        return "u256";
      default:
        throw new Error(`Unexpected type ${type}`);
    }
  }
  if ("Vector" in type) {
    return { vector: normalizedTypeToMoveTypeSignatureBody(type.Vector) };
  }
  if ("Struct" in type) {
    return {
      datatype: {
        package: type.Struct.address,
        module: type.Struct.module,
        type: type.Struct.name,
        typeParameters: type.Struct.typeArguments.map(normalizedTypeToMoveTypeSignatureBody)
      }
    };
  }
  if ("TypeParameter" in type) {
    return { typeParameter: type.TypeParameter };
  }
  throw new Error(`Unexpected type ${JSON.stringify(type)}`);
}
__name(normalizedTypeToMoveTypeSignatureBody, "normalizedTypeToMoveTypeSignatureBody");

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/jsonRpc/json-rpc-resolver.js
init_esm2();
var MAX_OBJECTS_PER_FETCH = 50;
var GAS_SAFE_OVERHEAD = 1000n;
var MAX_GAS = 5e10;
function jsonRpcClientResolveTransactionPlugin(client) {
  return /* @__PURE__ */ __name(async function resolveTransactionData(transactionData, options, next) {
    await normalizeInputs(transactionData, client);
    await resolveObjectReferences(transactionData, client);
    if (!options.onlyTransactionKind) {
      await setGasPrice(transactionData, client);
      await setGasBudget(transactionData, client);
      await setGasPayment(transactionData, client);
    }
    return await next();
  }, "resolveTransactionData");
}
__name(jsonRpcClientResolveTransactionPlugin, "jsonRpcClientResolveTransactionPlugin");
async function setGasPrice(transactionData, client) {
  if (!transactionData.gasConfig.price) {
    transactionData.gasConfig.price = String(await client.getReferenceGasPrice());
  }
}
__name(setGasPrice, "setGasPrice");
async function setGasBudget(transactionData, client) {
  if (transactionData.gasConfig.budget) {
    return;
  }
  const dryRunResult = await client.dryRunTransactionBlock({
    transactionBlock: transactionData.build({
      overrides: {
        gasData: {
          budget: String(MAX_GAS),
          payment: []
        }
      }
    })
  });
  if (dryRunResult.effects.status.status !== "success") {
    throw new Error(
      `Dry run failed, could not automatically determine a budget: ${dryRunResult.effects.status.error}`,
      { cause: dryRunResult }
    );
  }
  const safeOverhead = GAS_SAFE_OVERHEAD * BigInt(transactionData.gasConfig.price || 1n);
  const baseComputationCostWithOverhead = BigInt(dryRunResult.effects.gasUsed.computationCost) + safeOverhead;
  const gasBudget = baseComputationCostWithOverhead + BigInt(dryRunResult.effects.gasUsed.storageCost) - BigInt(dryRunResult.effects.gasUsed.storageRebate);
  transactionData.gasConfig.budget = String(
    gasBudget > baseComputationCostWithOverhead ? gasBudget : baseComputationCostWithOverhead
  );
}
__name(setGasBudget, "setGasBudget");
async function setGasPayment(transactionData, client) {
  if (!transactionData.gasConfig.payment) {
    const coins = await client.getCoins({
      owner: transactionData.gasConfig.owner || transactionData.sender,
      coinType: SUI_TYPE_ARG
    });
    const paymentCoins = coins.data.filter((coin) => {
      const matchingInput = transactionData.inputs.find((input) => {
        if (input.Object?.ImmOrOwnedObject) {
          return coin.coinObjectId === input.Object.ImmOrOwnedObject.objectId;
        }
        return false;
      });
      return !matchingInput;
    }).map((coin) => ({
      objectId: coin.coinObjectId,
      digest: coin.digest,
      version: coin.version
    }));
    if (!paymentCoins.length) {
      throw new Error("No valid gas coins found for the transaction.");
    }
    transactionData.gasConfig.payment = paymentCoins.map(
      (payment) => parse(ObjectRefSchema, payment)
    );
  }
}
__name(setGasPayment, "setGasPayment");
async function resolveObjectReferences(transactionData, client) {
  const objectsToResolve = transactionData.inputs.filter((input) => {
    return input.UnresolvedObject && !(input.UnresolvedObject.version || input.UnresolvedObject?.initialSharedVersion);
  });
  const dedupedIds = [
    ...new Set(
      objectsToResolve.map((input) => normalizeSuiObjectId(input.UnresolvedObject.objectId))
    )
  ];
  const objectChunks = dedupedIds.length ? chunk(dedupedIds, MAX_OBJECTS_PER_FETCH) : [];
  const resolved = (await Promise.all(
    objectChunks.map(
      (chunk2) => client.multiGetObjects({
        ids: chunk2,
        options: { showOwner: true }
      })
    )
  )).flat();
  const responsesById = new Map(
    dedupedIds.map((id, index) => {
      return [id, resolved[index]];
    })
  );
  const invalidObjects = Array.from(responsesById).filter(([_, obj]) => obj.error).map(([_, obj]) => JSON.stringify(obj.error));
  if (invalidObjects.length) {
    throw new Error(`The following input objects are invalid: ${invalidObjects.join(", ")}`);
  }
  const objects = resolved.map((object2) => {
    if (object2.error || !object2.data) {
      throw new Error(`Failed to fetch object: ${object2.error}`);
    }
    const owner = object2.data.owner;
    const initialSharedVersion = owner && typeof owner === "object" ? "Shared" in owner ? owner.Shared.initial_shared_version : "ConsensusAddressOwner" in owner ? owner.ConsensusAddressOwner.start_version : null : null;
    return {
      objectId: object2.data.objectId,
      digest: object2.data.digest,
      version: object2.data.version,
      initialSharedVersion
    };
  });
  const objectsById = new Map(
    dedupedIds.map((id, index) => {
      return [id, objects[index]];
    })
  );
  for (const [index, input] of transactionData.inputs.entries()) {
    if (!input.UnresolvedObject) {
      continue;
    }
    let updated;
    const id = normalizeSuiAddress(input.UnresolvedObject.objectId);
    const object2 = objectsById.get(id);
    if (input.UnresolvedObject.initialSharedVersion ?? object2?.initialSharedVersion) {
      updated = Inputs.SharedObjectRef({
        objectId: id,
        initialSharedVersion: input.UnresolvedObject.initialSharedVersion || object2?.initialSharedVersion,
        mutable: input.UnresolvedObject.mutable || isUsedAsMutable(transactionData, index)
      });
    } else if (isUsedAsReceiving(transactionData, index)) {
      updated = Inputs.ReceivingRef(
        {
          objectId: id,
          digest: input.UnresolvedObject.digest ?? object2?.digest,
          version: input.UnresolvedObject.version ?? object2?.version
        }
      );
    }
    transactionData.inputs[transactionData.inputs.indexOf(input)] = updated ?? Inputs.ObjectRef({
      objectId: id,
      digest: input.UnresolvedObject.digest ?? object2?.digest,
      version: input.UnresolvedObject.version ?? object2?.version
    });
  }
}
__name(resolveObjectReferences, "resolveObjectReferences");
async function normalizeInputs(transactionData, client) {
  const { inputs, commands } = transactionData;
  const moveCallsToResolve = [];
  const moveFunctionsToResolve = /* @__PURE__ */ new Set();
  commands.forEach((command) => {
    if (command.MoveCall) {
      if (command.MoveCall._argumentTypes) {
        return;
      }
      const inputs2 = command.MoveCall.arguments.map((arg) => {
        if (arg.$kind === "Input") {
          return transactionData.inputs[arg.Input];
        }
        return null;
      });
      const needsResolution = inputs2.some(
        (input) => input?.UnresolvedPure || input?.UnresolvedObject && typeof input?.UnresolvedObject.mutable !== "boolean"
      );
      if (needsResolution) {
        const functionName = `${command.MoveCall.package}::${command.MoveCall.module}::${command.MoveCall.function}`;
        moveFunctionsToResolve.add(functionName);
        moveCallsToResolve.push(command.MoveCall);
      }
    }
  });
  const moveFunctionParameters = /* @__PURE__ */ new Map();
  if (moveFunctionsToResolve.size > 0) {
    await Promise.all(
      [...moveFunctionsToResolve].map(async (functionName) => {
        const [packageId, moduleId, functionId] = functionName.split("::");
        const def = await client.getNormalizedMoveFunction({
          package: packageId,
          module: moduleId,
          function: functionId
        });
        moveFunctionParameters.set(
          functionName,
          def.parameters.map((param) => normalizedTypeToMoveTypeSignature(param))
        );
      })
    );
  }
  if (moveCallsToResolve.length) {
    await Promise.all(
      moveCallsToResolve.map(async (moveCall) => {
        const parameters = moveFunctionParameters.get(
          `${moveCall.package}::${moveCall.module}::${moveCall.function}`
        );
        if (!parameters) {
          return;
        }
        const hasTxContext = parameters.length > 0 && isTxContext(parameters.at(-1));
        const params = hasTxContext ? parameters.slice(0, parameters.length - 1) : parameters;
        moveCall._argumentTypes = params;
      })
    );
  }
  commands.forEach((command) => {
    if (!command.MoveCall) {
      return;
    }
    const moveCall = command.MoveCall;
    const fnName = `${moveCall.package}::${moveCall.module}::${moveCall.function}`;
    const params = moveCall._argumentTypes;
    if (!params) {
      return;
    }
    if (params.length !== command.MoveCall.arguments.length) {
      throw new Error(`Incorrect number of arguments for ${fnName}`);
    }
    params.forEach((param, i) => {
      const arg = moveCall.arguments[i];
      if (arg.$kind !== "Input") return;
      const input = inputs[arg.Input];
      if (!input.UnresolvedPure && !input.UnresolvedObject) {
        return;
      }
      const inputValue = input.UnresolvedPure?.value ?? input.UnresolvedObject?.objectId;
      const schema = getPureBcsSchema(param.body);
      if (schema) {
        arg.type = "pure";
        inputs[inputs.indexOf(input)] = Inputs.Pure(schema.serialize(inputValue));
        return;
      }
      if (typeof inputValue !== "string") {
        throw new Error(
          `Expect the argument to be an object id string, got ${JSON.stringify(
            inputValue,
            null,
            2
          )}`
        );
      }
      arg.type = "object";
      const unresolvedObject = input.UnresolvedPure ? {
        $kind: "UnresolvedObject",
        UnresolvedObject: {
          objectId: inputValue
        }
      } : input;
      inputs[arg.Input] = unresolvedObject;
    });
  });
}
__name(normalizeInputs, "normalizeInputs");
function isUsedAsMutable(transactionData, index) {
  let usedAsMutable = false;
  transactionData.getInputUses(index, (arg, tx) => {
    if (tx.MoveCall && tx.MoveCall._argumentTypes) {
      const argIndex = tx.MoveCall.arguments.indexOf(arg);
      usedAsMutable = tx.MoveCall._argumentTypes[argIndex].ref !== "&" || usedAsMutable;
    }
    if (tx.$kind === "MakeMoveVec" || tx.$kind === "MergeCoins" || tx.$kind === "SplitCoins" || tx.$kind === "TransferObjects") {
      usedAsMutable = true;
    }
  });
  return usedAsMutable;
}
__name(isUsedAsMutable, "isUsedAsMutable");
function isUsedAsReceiving(transactionData, index) {
  let usedAsReceiving = false;
  transactionData.getInputUses(index, (arg, tx) => {
    if (tx.MoveCall && tx.MoveCall._argumentTypes) {
      const argIndex = tx.MoveCall.arguments.indexOf(arg);
      usedAsReceiving = isReceivingType(tx.MoveCall._argumentTypes[argIndex]) || usedAsReceiving;
    }
  });
  return usedAsReceiving;
}
__name(isUsedAsReceiving, "isUsedAsReceiving");
function isReceivingType(type) {
  if (typeof type.body !== "object" || !("datatype" in type.body)) {
    return false;
  }
  return type.body.datatype.package === "0x2" && type.body.datatype.module === "transfer" && type.body.datatype.type === "Receiving";
}
__name(isReceivingType, "isReceivingType");

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/resolve.js
function needsTransactionResolution(data, options) {
  if (data.inputs.some((input) => {
    return input.UnresolvedObject || input.UnresolvedPure;
  })) {
    return true;
  }
  if (!options.onlyTransactionKind) {
    if (!data.gasConfig.price || !data.gasConfig.budget || !data.gasConfig.payment) {
      return true;
    }
  }
  return false;
}
__name(needsTransactionResolution, "needsTransactionResolution");
async function resolveTransactionPlugin(transactionData, options, next) {
  normalizeRawArguments(transactionData);
  if (!needsTransactionResolution(transactionData, options)) {
    await validate(transactionData);
    return next();
  }
  const client = getClient(options);
  const plugin = client.core?.resolveTransactionPlugin() ?? jsonRpcClientResolveTransactionPlugin(client);
  return plugin(transactionData, options, async () => {
    await validate(transactionData);
    await next();
  });
}
__name(resolveTransactionPlugin, "resolveTransactionPlugin");
function validate(transactionData) {
  transactionData.inputs.forEach((input, index) => {
    if (input.$kind !== "Object" && input.$kind !== "Pure") {
      throw new Error(
        `Input at index ${index} has not been resolved.  Expected a Pure or Object input, but found ${JSON.stringify(
          input
        )}`
      );
    }
  });
}
__name(validate, "validate");
function getClient(options) {
  if (!options.client) {
    throw new Error(
      `No sui client passed to Transaction#build, but transaction data was not sufficient to build offline.`
    );
  }
  return options.client;
}
__name(getClient, "getClient");
function normalizeRawArguments(transactionData) {
  for (const command of transactionData.commands) {
    switch (command.$kind) {
      case "SplitCoins":
        command.SplitCoins.amounts.forEach((amount) => {
          normalizeRawArgument(amount, suiBcs.U64, transactionData);
        });
        break;
      case "TransferObjects":
        normalizeRawArgument(command.TransferObjects.address, suiBcs.Address, transactionData);
        break;
    }
  }
}
__name(normalizeRawArguments, "normalizeRawArguments");
function normalizeRawArgument(arg, schema, transactionData) {
  if (arg.$kind !== "Input") {
    return;
  }
  const input = transactionData.inputs[arg.Input];
  if (input.$kind !== "UnresolvedPure") {
    return;
  }
  transactionData.inputs[arg.Input] = Inputs.Pure(schema.serialize(input.UnresolvedPure.value));
}
__name(normalizeRawArgument, "normalizeRawArgument");

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/object.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function createObjectMethods(makeObject) {
  function object2(value) {
    return makeObject(value);
  }
  __name(object2, "object");
  object2.system = (options) => {
    const mutable = options?.mutable;
    if (mutable !== void 0) {
      return object2(
        Inputs.SharedObjectRef({
          objectId: "0x5",
          initialSharedVersion: 1,
          mutable
        })
      );
    }
    return object2({
      $kind: "UnresolvedObject",
      UnresolvedObject: {
        objectId: "0x5",
        initialSharedVersion: 1
      }
    });
  };
  object2.clock = () => object2(
    Inputs.SharedObjectRef({
      objectId: "0x6",
      initialSharedVersion: 1,
      mutable: false
    })
  );
  object2.random = () => object2({
    $kind: "UnresolvedObject",
    UnresolvedObject: {
      objectId: "0x8",
      mutable: false
    }
  });
  object2.denyList = (options) => {
    return object2({
      $kind: "UnresolvedObject",
      UnresolvedObject: {
        objectId: "0x403",
        mutable: options?.mutable
      }
    });
  };
  object2.option = ({ type, value }) => (tx) => tx.moveCall({
    typeArguments: [type],
    target: `0x1::option::${value === null ? "none" : "some"}`,
    arguments: value === null ? [] : [tx.object(value)]
  });
  return object2;
}
__name(createObjectMethods, "createObjectMethods");

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/pure.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_esm3();
init_bcs3();
init_pure();
function createPure(makePure) {
  function pure(typeOrSerializedValue, value) {
    if (typeof typeOrSerializedValue === "string") {
      return makePure(pureBcsSchemaFromTypeName(typeOrSerializedValue).serialize(value));
    }
    if (typeOrSerializedValue instanceof Uint8Array || isSerializedBcs(typeOrSerializedValue)) {
      return makePure(typeOrSerializedValue);
    }
    throw new Error("tx.pure must be called either a bcs type name, or a serialized bcs value");
  }
  __name(pure, "pure");
  pure.u8 = (value) => makePure(suiBcs.U8.serialize(value));
  pure.u16 = (value) => makePure(suiBcs.U16.serialize(value));
  pure.u32 = (value) => makePure(suiBcs.U32.serialize(value));
  pure.u64 = (value) => makePure(suiBcs.U64.serialize(value));
  pure.u128 = (value) => makePure(suiBcs.U128.serialize(value));
  pure.u256 = (value) => makePure(suiBcs.U256.serialize(value));
  pure.bool = (value) => makePure(suiBcs.Bool.serialize(value));
  pure.string = (value) => makePure(suiBcs.String.serialize(value));
  pure.address = (value) => makePure(suiBcs.Address.serialize(value));
  pure.id = pure.address;
  pure.vector = (type, value) => {
    return makePure(
      suiBcs.vector(pureBcsSchemaFromTypeName(type)).serialize(value)
    );
  };
  pure.option = (type, value) => {
    return makePure(suiBcs.option(pureBcsSchemaFromTypeName(type)).serialize(value));
  };
  return pure;
}
__name(createPure, "createPure");

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/Transaction.js
init_TransactionData();
init_utils4();

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/plugins/NamedPackagesPlugin.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_cache();
init_mvr();
init_mvr();
var cacheMap = /* @__PURE__ */ new WeakMap();
var namedPackagesPlugin = /* @__PURE__ */ __name((options) => {
  let mvrClient;
  if (options) {
    const overrides = options.overrides ?? {
      packages: {},
      types: {}
    };
    if (!cacheMap.has(overrides)) {
      cacheMap.set(overrides, new ClientCache());
    }
    mvrClient = new MvrClient({
      cache: cacheMap.get(overrides),
      url: options.url,
      pageSize: options.pageSize,
      overrides
    });
  }
  return async (transactionData, buildOptions, next) => {
    const names = findNamesInTransaction(transactionData);
    if (names.types.length === 0 && names.packages.length === 0) {
      return next();
    }
    const resolved = await (mvrClient || getClient2(buildOptions).core.mvr).resolve({
      types: names.types,
      packages: names.packages
    });
    replaceNames(transactionData, resolved);
    await next();
  };
}, "namedPackagesPlugin");
function getClient2(options) {
  if (!options.client) {
    throw new Error(
      `No sui client passed to Transaction#build, but transaction data was not sufficient to build offline.`
    );
  }
  return options.client;
}
__name(getClient2, "getClient");

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/Transaction.js
var __typeError6 = /* @__PURE__ */ __name((msg) => {
  throw TypeError(msg);
}, "__typeError");
var __accessCheck6 = /* @__PURE__ */ __name((obj, member, msg) => member.has(obj) || __typeError6("Cannot " + msg), "__accessCheck");
var __privateGet6 = /* @__PURE__ */ __name((obj, member, getter) => (__accessCheck6(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj)), "__privateGet");
var __privateAdd6 = /* @__PURE__ */ __name((obj, member, value) => member.has(obj) ? __typeError6("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value), "__privateAdd");
var __privateSet6 = /* @__PURE__ */ __name((obj, member, value, setter) => (__accessCheck6(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value), "__privateSet");
var __privateMethod4 = /* @__PURE__ */ __name((obj, member, method) => (__accessCheck6(obj, member, "access private method"), method), "__privateMethod");
var _serializationPlugins;
var _buildPlugins;
var _intentResolvers;
var _inputSection;
var _commandSection;
var _availableResults;
var _pendingPromises;
var _added;
var _data;
var _Transaction_instances;
var fork_fn;
var addCommand_fn;
var addInput_fn;
var normalizeTransactionArgument_fn;
var resolveArgument_fn;
var prepareBuild_fn;
var runPlugins_fn;
var waitForPendingTasks_fn;
var sortCommandsAndInputs_fn;
function createTransactionResult(index, length = Infinity) {
  const baseResult = {
    $kind: "Result",
    get Result() {
      return typeof index === "function" ? index() : index;
    }
  };
  const nestedResults = [];
  const nestedResultFor = /* @__PURE__ */ __name((resultIndex) => nestedResults[resultIndex] ?? (nestedResults[resultIndex] = {
    $kind: "NestedResult",
    get NestedResult() {
      return [typeof index === "function" ? index() : index, resultIndex];
    }
  }), "nestedResultFor");
  return new Proxy(baseResult, {
    set() {
      throw new Error(
        "The transaction result is a proxy, and does not support setting properties directly"
      );
    },
    // TODO: Instead of making this return a concrete argument, we should ideally
    // make it reference-based (so that this gets resolved at build-time), which
    // allows re-ordering transactions.
    get(target, property) {
      if (property in target) {
        return Reflect.get(target, property);
      }
      if (property === Symbol.iterator) {
        return function* () {
          let i = 0;
          while (i < length) {
            yield nestedResultFor(i);
            i++;
          }
        };
      }
      if (typeof property === "symbol") return;
      const resultIndex = parseInt(property, 10);
      if (Number.isNaN(resultIndex) || resultIndex < 0) return;
      return nestedResultFor(resultIndex);
    }
  });
}
__name(createTransactionResult, "createTransactionResult");
var TRANSACTION_BRAND = /* @__PURE__ */ Symbol.for("@mysten/transaction");
function isTransaction(obj) {
  return !!obj && typeof obj === "object" && obj[TRANSACTION_BRAND] === true;
}
__name(isTransaction, "isTransaction");
var modulePluginRegistry = {
  buildPlugins: /* @__PURE__ */ new Map(),
  serializationPlugins: /* @__PURE__ */ new Map()
};
var TRANSACTION_REGISTRY_KEY = /* @__PURE__ */ Symbol.for("@mysten/transaction/registry");
function getGlobalPluginRegistry() {
  try {
    const target = globalThis;
    if (!target[TRANSACTION_REGISTRY_KEY]) {
      target[TRANSACTION_REGISTRY_KEY] = modulePluginRegistry;
    }
    return target[TRANSACTION_REGISTRY_KEY];
  } catch {
    return modulePluginRegistry;
  }
}
__name(getGlobalPluginRegistry, "getGlobalPluginRegistry");
var _Transaction = class _Transaction2 {
  static {
    __name(this, "_Transaction");
  }
  constructor() {
    __privateAdd6(this, _Transaction_instances);
    __privateAdd6(this, _serializationPlugins);
    __privateAdd6(this, _buildPlugins);
    __privateAdd6(this, _intentResolvers, /* @__PURE__ */ new Map());
    __privateAdd6(this, _inputSection, []);
    __privateAdd6(this, _commandSection, []);
    __privateAdd6(this, _availableResults, /* @__PURE__ */ new Set());
    __privateAdd6(this, _pendingPromises, /* @__PURE__ */ new Set());
    __privateAdd6(this, _added, /* @__PURE__ */ new Map());
    __privateAdd6(this, _data);
    this.object = createObjectMethods(
      (value) => {
        if (typeof value === "function") {
          return this.object(this.add(value));
        }
        if (typeof value === "object" && is(ArgumentSchema, value)) {
          return value;
        }
        const id = getIdFromCallArg(value);
        const inserted = __privateGet6(this, _data).inputs.find((i) => id === getIdFromCallArg(i));
        if (inserted?.Object?.SharedObject && typeof value === "object" && value.Object?.SharedObject) {
          inserted.Object.SharedObject.mutable = inserted.Object.SharedObject.mutable || value.Object.SharedObject.mutable;
        }
        return inserted ? { $kind: "Input", Input: __privateGet6(this, _data).inputs.indexOf(inserted), type: "object" } : __privateMethod4(this, _Transaction_instances, addInput_fn).call(this, "object", typeof value === "string" ? {
          $kind: "UnresolvedObject",
          UnresolvedObject: { objectId: normalizeSuiAddress(value) }
        } : value);
      }
    );
    const globalPlugins = getGlobalPluginRegistry();
    __privateSet6(this, _data, new TransactionDataBuilder());
    __privateSet6(this, _buildPlugins, [...globalPlugins.buildPlugins.values()]);
    __privateSet6(this, _serializationPlugins, [...globalPlugins.serializationPlugins.values()]);
  }
  /**
   * Converts from a serialize transaction kind (built with `build({ onlyTransactionKind: true })`) to a `Transaction` class.
   * Supports either a byte array, or base64-encoded bytes.
   */
  static fromKind(serialized) {
    const tx = new _Transaction2();
    __privateSet6(tx, _data, TransactionDataBuilder.fromKindBytes(
      typeof serialized === "string" ? fromBase64(serialized) : serialized
    ));
    __privateSet6(tx, _inputSection, __privateGet6(tx, _data).inputs.slice());
    __privateSet6(tx, _commandSection, __privateGet6(tx, _data).commands.slice());
    __privateSet6(tx, _availableResults, new Set(__privateGet6(tx, _commandSection).map((_, i) => i)));
    return tx;
  }
  /**
   * Converts from a serialized transaction format to a `Transaction` class.
   * There are two supported serialized formats:
   * - A string returned from `Transaction#serialize`. The serialized format must be compatible, or it will throw an error.
   * - A byte array (or base64-encoded bytes) containing BCS transaction data.
   */
  static from(transaction) {
    const newTransaction = new _Transaction2();
    if (isTransaction(transaction)) {
      __privateSet6(newTransaction, _data, TransactionDataBuilder.restore(
        transaction.getData()
      ));
    } else if (typeof transaction !== "string" || !transaction.startsWith("{")) {
      __privateSet6(newTransaction, _data, TransactionDataBuilder.fromBytes(
        typeof transaction === "string" ? fromBase64(transaction) : transaction
      ));
    } else {
      __privateSet6(newTransaction, _data, TransactionDataBuilder.restore(JSON.parse(transaction)));
    }
    __privateSet6(newTransaction, _inputSection, __privateGet6(newTransaction, _data).inputs.slice());
    __privateSet6(newTransaction, _commandSection, __privateGet6(newTransaction, _data).commands.slice());
    __privateSet6(newTransaction, _availableResults, new Set(__privateGet6(newTransaction, _commandSection).map((_, i) => i)));
    return newTransaction;
  }
  static registerGlobalSerializationPlugin(stepOrStep, step) {
    getGlobalPluginRegistry().serializationPlugins.set(
      stepOrStep,
      step ?? stepOrStep
    );
  }
  static unregisterGlobalSerializationPlugin(name) {
    getGlobalPluginRegistry().serializationPlugins.delete(name);
  }
  static registerGlobalBuildPlugin(stepOrStep, step) {
    getGlobalPluginRegistry().buildPlugins.set(
      stepOrStep,
      step ?? stepOrStep
    );
  }
  static unregisterGlobalBuildPlugin(name) {
    getGlobalPluginRegistry().buildPlugins.delete(name);
  }
  addSerializationPlugin(step) {
    __privateGet6(this, _serializationPlugins).push(step);
  }
  addBuildPlugin(step) {
    __privateGet6(this, _buildPlugins).push(step);
  }
  addIntentResolver(intent, resolver) {
    if (__privateGet6(this, _intentResolvers).has(intent) && __privateGet6(this, _intentResolvers).get(intent) !== resolver) {
      throw new Error(`Intent resolver for ${intent} already exists`);
    }
    __privateGet6(this, _intentResolvers).set(intent, resolver);
  }
  setSender(sender) {
    __privateGet6(this, _data).sender = sender;
  }
  /**
   * Sets the sender only if it has not already been set.
   * This is useful for sponsored transaction flows where the sender may not be the same as the signer address.
   */
  setSenderIfNotSet(sender) {
    if (!__privateGet6(this, _data).sender) {
      __privateGet6(this, _data).sender = sender;
    }
  }
  setExpiration(expiration) {
    __privateGet6(this, _data).expiration = expiration ? parse(TransactionExpiration, expiration) : null;
  }
  setGasPrice(price) {
    __privateGet6(this, _data).gasConfig.price = String(price);
  }
  setGasBudget(budget) {
    __privateGet6(this, _data).gasConfig.budget = String(budget);
  }
  setGasBudgetIfNotSet(budget) {
    if (__privateGet6(this, _data).gasData.budget == null) {
      __privateGet6(this, _data).gasConfig.budget = String(budget);
    }
  }
  setGasOwner(owner) {
    __privateGet6(this, _data).gasConfig.owner = owner;
  }
  setGasPayment(payments) {
    __privateGet6(this, _data).gasConfig.payment = payments.map((payment) => parse(ObjectRefSchema, payment));
  }
  /** @deprecated Use `getData()` instead. */
  get blockData() {
    return serializeV1TransactionData(__privateGet6(this, _data).snapshot());
  }
  /** Get a snapshot of the transaction data, in JSON form: */
  getData() {
    return __privateGet6(this, _data).snapshot();
  }
  // Used to brand transaction classes so that they can be identified, even between multiple copies
  // of the builder.
  get [TRANSACTION_BRAND]() {
    return true;
  }
  // Temporary workaround for the wallet interface accidentally serializing transactions via postMessage
  get pure() {
    Object.defineProperty(this, "pure", {
      enumerable: false,
      value: createPure((value) => {
        if (isSerializedBcs(value)) {
          return __privateMethod4(this, _Transaction_instances, addInput_fn).call(this, "pure", {
            $kind: "Pure",
            Pure: {
              bytes: value.toBase64()
            }
          });
        }
        return __privateMethod4(this, _Transaction_instances, addInput_fn).call(this, "pure", is(NormalizedCallArg, value) ? parse(NormalizedCallArg, value) : value instanceof Uint8Array ? Inputs.Pure(value) : { $kind: "UnresolvedPure", UnresolvedPure: { value } });
      })
    });
    return this.pure;
  }
  /** Returns an argument for the gas coin, to be used in a transaction. */
  get gas() {
    return { $kind: "GasCoin", GasCoin: true };
  }
  /**
   * Add a new object input to the transaction using the fully-resolved object reference.
   * If you only have an object ID, use `builder.object(id)` instead.
   */
  objectRef(...args) {
    return this.object(Inputs.ObjectRef(...args));
  }
  /**
   * Add a new receiving input to the transaction using the fully-resolved object reference.
   * If you only have an object ID, use `builder.object(id)` instead.
   */
  receivingRef(...args) {
    return this.object(Inputs.ReceivingRef(...args));
  }
  /**
   * Add a new shared object input to the transaction using the fully-resolved shared object reference.
   * If you only have an object ID, use `builder.object(id)` instead.
   */
  sharedObjectRef(...args) {
    return this.object(Inputs.SharedObjectRef(...args));
  }
  add(command) {
    if (typeof command === "function") {
      if (__privateGet6(this, _added).has(command)) {
        return __privateGet6(this, _added).get(command);
      }
      const fork = __privateMethod4(this, _Transaction_instances, fork_fn).call(this);
      const result = command(fork);
      if (!(result && typeof result === "object" && "then" in result)) {
        __privateSet6(this, _availableResults, __privateGet6(fork, _availableResults));
        __privateGet6(this, _added).set(command, result);
        return result;
      }
      const placeholder = __privateMethod4(this, _Transaction_instances, addCommand_fn).call(this, {
        $kind: "$Intent",
        $Intent: {
          name: "AsyncTransactionThunk",
          inputs: {},
          data: {
            resultIndex: __privateGet6(this, _data).commands.length,
            result: null
          }
        }
      });
      __privateGet6(this, _pendingPromises).add(
        Promise.resolve(result).then((result2) => {
          placeholder.$Intent.data.result = result2;
        })
      );
      const txResult = createTransactionResult(() => placeholder.$Intent.data.resultIndex);
      __privateGet6(this, _added).set(command, txResult);
      return txResult;
    } else {
      __privateMethod4(this, _Transaction_instances, addCommand_fn).call(this, command);
    }
    return createTransactionResult(__privateGet6(this, _data).commands.length - 1);
  }
  // Method shorthands:
  splitCoins(coin, amounts) {
    const command = Commands.SplitCoins(
      typeof coin === "string" ? this.object(coin) : __privateMethod4(this, _Transaction_instances, resolveArgument_fn).call(this, coin),
      amounts.map(
        (amount) => typeof amount === "number" || typeof amount === "bigint" || typeof amount === "string" ? this.pure.u64(amount) : __privateMethod4(this, _Transaction_instances, normalizeTransactionArgument_fn).call(this, amount)
      )
    );
    __privateMethod4(this, _Transaction_instances, addCommand_fn).call(this, command);
    return createTransactionResult(__privateGet6(this, _data).commands.length - 1, amounts.length);
  }
  mergeCoins(destination, sources) {
    return this.add(
      Commands.MergeCoins(
        this.object(destination),
        sources.map((src) => this.object(src))
      )
    );
  }
  publish({ modules, dependencies }) {
    return this.add(
      Commands.Publish({
        modules,
        dependencies
      })
    );
  }
  upgrade({
    modules,
    dependencies,
    package: packageId,
    ticket
  }) {
    return this.add(
      Commands.Upgrade({
        modules,
        dependencies,
        package: packageId,
        ticket: this.object(ticket)
      })
    );
  }
  moveCall({
    arguments: args,
    ...input
  }) {
    return this.add(
      Commands.MoveCall({
        ...input,
        arguments: args?.map((arg) => __privateMethod4(this, _Transaction_instances, normalizeTransactionArgument_fn).call(this, arg))
      })
    );
  }
  transferObjects(objects, address) {
    return this.add(
      Commands.TransferObjects(
        objects.map((obj) => this.object(obj)),
        typeof address === "string" ? this.pure.address(address) : __privateMethod4(this, _Transaction_instances, normalizeTransactionArgument_fn).call(this, address)
      )
    );
  }
  makeMoveVec({
    type,
    elements
  }) {
    return this.add(
      Commands.MakeMoveVec({
        type,
        elements: elements.map((obj) => this.object(obj))
      })
    );
  }
  /**
   * @deprecated Use toJSON instead.
   * For synchronous serialization, you can use `getData()`
   * */
  serialize() {
    return JSON.stringify(serializeV1TransactionData(__privateGet6(this, _data).snapshot()));
  }
  async toJSON(options = {}) {
    await this.prepareForSerialization(options);
    const fullyResolved = this.isFullyResolved();
    return JSON.stringify(
      parse(
        SerializedTransactionDataV2Schema,
        fullyResolved ? {
          ...__privateGet6(this, _data).snapshot(),
          digest: __privateGet6(this, _data).getDigest()
        } : __privateGet6(this, _data).snapshot()
      ),
      (_key, value) => typeof value === "bigint" ? value.toString() : value,
      2
    );
  }
  /** Build the transaction to BCS bytes, and sign it with the provided keypair. */
  async sign(options) {
    const { signer, ...buildOptions } = options;
    const bytes = await this.build(buildOptions);
    return signer.signTransaction(bytes);
  }
  /**
   *  Ensures that:
   *  - All objects have been fully resolved to a specific version
   *  - All pure inputs have been serialized to bytes
   *  - All async thunks have been fully resolved
   *  - All transaction intents have been resolved
   * 	- The gas payment, budget, and price have been set
   *  - The transaction sender has been set
   *
   *  When true, the transaction will always be built to the same bytes and digest (unless the transaction is mutated)
   */
  isFullyResolved() {
    if (!__privateGet6(this, _data).sender) {
      return false;
    }
    if (__privateGet6(this, _pendingPromises).size > 0) {
      return false;
    }
    if (__privateGet6(this, _data).commands.some((cmd) => cmd.$Intent)) {
      return false;
    }
    if (needsTransactionResolution(__privateGet6(this, _data), {})) {
      return false;
    }
    return true;
  }
  /** Build the transaction to BCS bytes. */
  async build(options = {}) {
    await this.prepareForSerialization(options);
    await __privateMethod4(this, _Transaction_instances, prepareBuild_fn).call(this, options);
    return __privateGet6(this, _data).build({
      onlyTransactionKind: options.onlyTransactionKind
    });
  }
  /** Derive transaction digest */
  async getDigest(options = {}) {
    await this.prepareForSerialization(options);
    await __privateMethod4(this, _Transaction_instances, prepareBuild_fn).call(this, options);
    return __privateGet6(this, _data).getDigest();
  }
  async prepareForSerialization(options) {
    await __privateMethod4(this, _Transaction_instances, waitForPendingTasks_fn).call(this);
    __privateMethod4(this, _Transaction_instances, sortCommandsAndInputs_fn).call(this);
    const intents = /* @__PURE__ */ new Set();
    for (const command of __privateGet6(this, _data).commands) {
      if (command.$Intent) {
        intents.add(command.$Intent.name);
      }
    }
    const steps = [...__privateGet6(this, _serializationPlugins)];
    for (const intent of intents) {
      if (options.supportedIntents?.includes(intent)) {
        continue;
      }
      if (!__privateGet6(this, _intentResolvers).has(intent)) {
        throw new Error(`Missing intent resolver for ${intent}`);
      }
      steps.push(__privateGet6(this, _intentResolvers).get(intent));
    }
    steps.push(namedPackagesPlugin());
    await __privateMethod4(this, _Transaction_instances, runPlugins_fn).call(this, steps, options);
  }
};
_serializationPlugins = /* @__PURE__ */ new WeakMap();
_buildPlugins = /* @__PURE__ */ new WeakMap();
_intentResolvers = /* @__PURE__ */ new WeakMap();
_inputSection = /* @__PURE__ */ new WeakMap();
_commandSection = /* @__PURE__ */ new WeakMap();
_availableResults = /* @__PURE__ */ new WeakMap();
_pendingPromises = /* @__PURE__ */ new WeakMap();
_added = /* @__PURE__ */ new WeakMap();
_data = /* @__PURE__ */ new WeakMap();
_Transaction_instances = /* @__PURE__ */ new WeakSet();
fork_fn = /* @__PURE__ */ __name(function() {
  const fork = new _Transaction();
  __privateSet6(fork, _data, __privateGet6(this, _data));
  __privateSet6(fork, _serializationPlugins, __privateGet6(this, _serializationPlugins));
  __privateSet6(fork, _buildPlugins, __privateGet6(this, _buildPlugins));
  __privateSet6(fork, _intentResolvers, __privateGet6(this, _intentResolvers));
  __privateSet6(fork, _pendingPromises, __privateGet6(this, _pendingPromises));
  __privateSet6(fork, _availableResults, new Set(__privateGet6(this, _availableResults)));
  __privateSet6(fork, _added, __privateGet6(this, _added));
  __privateGet6(this, _inputSection).push(__privateGet6(fork, _inputSection));
  __privateGet6(this, _commandSection).push(__privateGet6(fork, _commandSection));
  return fork;
}, "fork_fn");
addCommand_fn = /* @__PURE__ */ __name(function(command) {
  const resultIndex = __privateGet6(this, _data).commands.length;
  __privateGet6(this, _commandSection).push(command);
  __privateGet6(this, _availableResults).add(resultIndex);
  __privateGet6(this, _data).commands.push(command);
  __privateGet6(this, _data).mapCommandArguments(resultIndex, (arg) => {
    if (arg.$kind === "Result" && !__privateGet6(this, _availableResults).has(arg.Result)) {
      throw new Error(
        `Result { Result: ${arg.Result} } is not available to use in the current transaction`
      );
    }
    if (arg.$kind === "NestedResult" && !__privateGet6(this, _availableResults).has(arg.NestedResult[0])) {
      throw new Error(
        `Result { NestedResult: [${arg.NestedResult[0]}, ${arg.NestedResult[1]}] } is not available to use in the current transaction`
      );
    }
    if (arg.$kind === "Input" && arg.Input >= __privateGet6(this, _data).inputs.length) {
      throw new Error(
        `Input { Input: ${arg.Input} } references an input that does not exist in the current transaction`
      );
    }
    return arg;
  });
  return command;
}, "addCommand_fn");
addInput_fn = /* @__PURE__ */ __name(function(type, input) {
  __privateGet6(this, _inputSection).push(input);
  return __privateGet6(this, _data).addInput(type, input);
}, "addInput_fn");
normalizeTransactionArgument_fn = /* @__PURE__ */ __name(function(arg) {
  if (isSerializedBcs(arg)) {
    return this.pure(arg);
  }
  return __privateMethod4(this, _Transaction_instances, resolveArgument_fn).call(this, arg);
}, "normalizeTransactionArgument_fn");
resolveArgument_fn = /* @__PURE__ */ __name(function(arg) {
  if (typeof arg === "function") {
    const resolved = this.add(arg);
    if (typeof resolved === "function") {
      return __privateMethod4(this, _Transaction_instances, resolveArgument_fn).call(this, resolved);
    }
    return parse(ArgumentSchema, resolved);
  }
  return parse(ArgumentSchema, arg);
}, "resolveArgument_fn");
prepareBuild_fn = /* @__PURE__ */ __name(async function(options) {
  if (!options.onlyTransactionKind && !__privateGet6(this, _data).sender) {
    throw new Error("Missing transaction sender");
  }
  await __privateMethod4(this, _Transaction_instances, runPlugins_fn).call(this, [...__privateGet6(this, _buildPlugins), resolveTransactionPlugin], options);
}, "prepareBuild_fn");
runPlugins_fn = /* @__PURE__ */ __name(async function(plugins, options) {
  try {
    const createNext = /* @__PURE__ */ __name((i) => {
      if (i >= plugins.length) {
        return () => {
        };
      }
      const plugin = plugins[i];
      return async () => {
        const next = createNext(i + 1);
        let calledNext = false;
        let nextResolved = false;
        await plugin(__privateGet6(this, _data), options, async () => {
          if (calledNext) {
            throw new Error(`next() was call multiple times in TransactionPlugin ${i}`);
          }
          calledNext = true;
          await next();
          nextResolved = true;
        });
        if (!calledNext) {
          throw new Error(`next() was not called in TransactionPlugin ${i}`);
        }
        if (!nextResolved) {
          throw new Error(`next() was not awaited in TransactionPlugin ${i}`);
        }
      };
    }, "createNext");
    await createNext(0)();
  } finally {
    __privateSet6(this, _inputSection, __privateGet6(this, _data).inputs.slice());
    __privateSet6(this, _commandSection, __privateGet6(this, _data).commands.slice());
    __privateSet6(this, _availableResults, new Set(__privateGet6(this, _commandSection).map((_, i) => i)));
  }
}, "runPlugins_fn");
waitForPendingTasks_fn = /* @__PURE__ */ __name(async function() {
  while (__privateGet6(this, _pendingPromises).size > 0) {
    const newPromise = Promise.all(__privateGet6(this, _pendingPromises));
    __privateGet6(this, _pendingPromises).clear();
    __privateGet6(this, _pendingPromises).add(newPromise);
    await newPromise;
    __privateGet6(this, _pendingPromises).delete(newPromise);
  }
}, "waitForPendingTasks_fn");
sortCommandsAndInputs_fn = /* @__PURE__ */ __name(function() {
  const unorderedCommands = __privateGet6(this, _data).commands;
  const unorderedInputs = __privateGet6(this, _data).inputs;
  const orderedCommands = __privateGet6(this, _commandSection).flat(Infinity);
  const orderedInputs = __privateGet6(this, _inputSection).flat(Infinity);
  if (orderedCommands.length !== unorderedCommands.length) {
    throw new Error("Unexpected number of commands found in transaction data");
  }
  if (orderedInputs.length !== unorderedInputs.length) {
    throw new Error("Unexpected number of inputs found in transaction data");
  }
  const filteredCommands = orderedCommands.filter(
    (cmd) => cmd.$Intent?.name !== "AsyncTransactionThunk"
  );
  __privateGet6(this, _data).commands = filteredCommands;
  __privateGet6(this, _data).inputs = orderedInputs;
  __privateSet6(this, _commandSection, filteredCommands);
  __privateSet6(this, _inputSection, orderedInputs);
  __privateSet6(this, _availableResults, new Set(filteredCommands.map((_, i) => i)));
  function getOriginalIndex(index) {
    const command = unorderedCommands[index];
    if (command.$Intent?.name === "AsyncTransactionThunk") {
      const result = command.$Intent.data.result;
      if (result == null) {
        throw new Error("AsyncTransactionThunk has not been resolved");
      }
      return getOriginalIndex(result.Result);
    }
    const updated = filteredCommands.indexOf(command);
    if (updated === -1) {
      throw new Error("Unable to find original index for command");
    }
    return updated;
  }
  __name(getOriginalIndex, "getOriginalIndex");
  __privateGet6(this, _data).mapArguments((arg) => {
    if (arg.$kind === "Input") {
      const updated = orderedInputs.indexOf(unorderedInputs[arg.Input]);
      if (updated === -1) {
        throw new Error("Input has not been resolved");
      }
      return { ...arg, Input: updated };
    } else if (arg.$kind === "Result") {
      const updated = getOriginalIndex(arg.Result);
      return { ...arg, Result: updated };
    } else if (arg.$kind === "NestedResult") {
      const updated = getOriginalIndex(arg.NestedResult[0]);
      return { ...arg, NestedResult: [updated, arg.NestedResult[1]] };
    }
    return arg;
  });
  for (const [i, cmd] of unorderedCommands.entries()) {
    if (cmd.$Intent?.name === "AsyncTransactionThunk") {
      try {
        cmd.$Intent.data.resultIndex = getOriginalIndex(i);
      } catch {
      }
    }
  }
}, "sortCommandsAndInputs_fn");
var Transaction = _Transaction;

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/jsonRpc/client.js
init_sui_types();
init_suins();
init_move_registry();
init_mvr();

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/jsonRpc/core.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
init_esm3();
init_bcs3();
init_TransactionData();
init_esm2();
init_sui_types();
init_core();
init_errors();
init_experimental();
var __typeError7 = /* @__PURE__ */ __name((msg) => {
  throw TypeError(msg);
}, "__typeError");
var __accessCheck7 = /* @__PURE__ */ __name((obj, member, msg) => member.has(obj) || __typeError7("Cannot " + msg), "__accessCheck");
var __privateGet7 = /* @__PURE__ */ __name((obj, member, getter) => (__accessCheck7(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj)), "__privateGet");
var __privateAdd7 = /* @__PURE__ */ __name((obj, member, value) => member.has(obj) ? __typeError7("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value), "__privateAdd");
var __privateSet7 = /* @__PURE__ */ __name((obj, member, value, setter) => (__accessCheck7(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value), "__privateSet");
var _jsonRpcClient;
var JSONRpcCoreClient = class extends Experimental_CoreClient {
  static {
    __name(this, "JSONRpcCoreClient");
  }
  constructor({
    jsonRpcClient,
    mvr
  }) {
    super({ network: jsonRpcClient.network, base: jsonRpcClient, mvr });
    __privateAdd7(this, _jsonRpcClient);
    __privateSet7(this, _jsonRpcClient, jsonRpcClient);
  }
  async getObjects(options) {
    const batches = chunk(options.objectIds, 50);
    const results = [];
    for (const batch of batches) {
      const objects = await __privateGet7(this, _jsonRpcClient).multiGetObjects({
        ids: batch,
        options: {
          showOwner: true,
          showType: true,
          showBcs: true,
          showPreviousTransaction: true
        },
        signal: options.signal
      });
      for (const [idx, object2] of objects.entries()) {
        if (object2.error) {
          results.push(ObjectError.fromResponse(object2.error, batch[idx]));
        } else {
          results.push(parseObject(object2.data));
        }
      }
    }
    return {
      objects: results
    };
  }
  async getOwnedObjects(options) {
    const objects = await __privateGet7(this, _jsonRpcClient).getOwnedObjects({
      owner: options.address,
      limit: options.limit,
      cursor: options.cursor,
      options: {
        showOwner: true,
        showType: true,
        showBcs: true,
        showPreviousTransaction: true
      },
      filter: options.type ? { StructType: options.type } : null,
      signal: options.signal
    });
    return {
      objects: objects.data.map((result) => {
        if (result.error) {
          throw ObjectError.fromResponse(result.error);
        }
        return parseObject(result.data);
      }),
      hasNextPage: objects.hasNextPage,
      cursor: objects.nextCursor ?? null
    };
  }
  async getCoins(options) {
    const coins = await __privateGet7(this, _jsonRpcClient).getCoins({
      owner: options.address,
      coinType: options.coinType,
      limit: options.limit,
      cursor: options.cursor,
      signal: options.signal
    });
    return {
      objects: coins.data.map((coin) => {
        return {
          id: coin.coinObjectId,
          version: coin.version,
          digest: coin.digest,
          balance: coin.balance,
          type: `0x2::coin::Coin<${coin.coinType}>`,
          content: Promise.resolve(
            Coin.serialize({
              id: coin.coinObjectId,
              balance: {
                value: coin.balance
              }
            }).toBytes()
          ),
          owner: {
            $kind: "ObjectOwner",
            ObjectOwner: options.address
          },
          previousTransaction: coin.previousTransaction
        };
      }),
      hasNextPage: coins.hasNextPage,
      cursor: coins.nextCursor ?? null
    };
  }
  async getBalance(options) {
    const balance = await __privateGet7(this, _jsonRpcClient).getBalance({
      owner: options.address,
      coinType: options.coinType,
      signal: options.signal
    });
    return {
      balance: {
        coinType: balance.coinType,
        balance: balance.totalBalance
      }
    };
  }
  async getAllBalances(options) {
    const balances = await __privateGet7(this, _jsonRpcClient).getAllBalances({
      owner: options.address,
      signal: options.signal
    });
    return {
      balances: balances.map((balance) => ({
        coinType: balance.coinType,
        balance: balance.totalBalance
      })),
      hasNextPage: false,
      cursor: null
    };
  }
  async getTransaction(options) {
    const transaction = await __privateGet7(this, _jsonRpcClient).getTransactionBlock({
      digest: options.digest,
      options: {
        showRawInput: true,
        showObjectChanges: true,
        showRawEffects: true,
        showEvents: true,
        showEffects: true,
        showBalanceChanges: true
      },
      signal: options.signal
    });
    return {
      transaction: parseTransaction(transaction)
    };
  }
  async executeTransaction(options) {
    const transaction = await __privateGet7(this, _jsonRpcClient).executeTransactionBlock({
      transactionBlock: options.transaction,
      signature: options.signatures,
      options: {
        showRawEffects: true,
        showEvents: true,
        showObjectChanges: true,
        showRawInput: true,
        showEffects: true,
        showBalanceChanges: true
      },
      signal: options.signal
    });
    return {
      transaction: parseTransaction(transaction)
    };
  }
  async dryRunTransaction(options) {
    const tx = Transaction.from(options.transaction);
    const result = await __privateGet7(this, _jsonRpcClient).dryRunTransactionBlock({
      transactionBlock: options.transaction,
      signal: options.signal
    });
    const { effects, objectTypes } = parseTransactionEffectsJson({
      effects: result.effects,
      objectChanges: result.objectChanges
    });
    return {
      transaction: {
        digest: await tx.getDigest(),
        epoch: null,
        effects,
        objectTypes: Promise.resolve(objectTypes),
        signatures: [],
        transaction: parseTransactionBcs(options.transaction),
        balanceChanges: result.balanceChanges.map((change) => ({
          coinType: change.coinType,
          address: parseOwnerAddress(change.owner),
          amount: change.amount
        }))
      }
    };
  }
  async getReferenceGasPrice(options) {
    const referenceGasPrice = await __privateGet7(this, _jsonRpcClient).getReferenceGasPrice({
      signal: options?.signal
    });
    return {
      referenceGasPrice: String(referenceGasPrice)
    };
  }
  async getDynamicFields(options) {
    const dynamicFields = await __privateGet7(this, _jsonRpcClient).getDynamicFields({
      parentId: options.parentId,
      limit: options.limit,
      cursor: options.cursor
    });
    return {
      dynamicFields: dynamicFields.data.map((dynamicField) => {
        return {
          id: dynamicField.objectId,
          type: dynamicField.objectType,
          name: {
            type: dynamicField.name.type,
            bcs: fromBase64(dynamicField.bcsName)
          }
        };
      }),
      hasNextPage: dynamicFields.hasNextPage,
      cursor: dynamicFields.nextCursor
    };
  }
  async verifyZkLoginSignature(options) {
    const result = await __privateGet7(this, _jsonRpcClient).verifyZkLoginSignature({
      bytes: options.bytes,
      signature: options.signature,
      intentScope: options.intentScope,
      author: options.author
    });
    return {
      success: result.success,
      errors: result.errors
    };
  }
  async defaultNameServiceName(options) {
    const name = (await __privateGet7(this, _jsonRpcClient).resolveNameServiceNames(options)).data[0];
    return {
      data: {
        name
      }
    };
  }
  resolveTransactionPlugin() {
    return jsonRpcClientResolveTransactionPlugin(__privateGet7(this, _jsonRpcClient));
  }
  async getMoveFunction(options) {
    const result = await __privateGet7(this, _jsonRpcClient).getNormalizedMoveFunction({
      package: (await this.mvr.resolvePackage({ package: options.packageId })).package,
      module: options.moduleName,
      function: options.name
    });
    return {
      function: {
        packageId: normalizeSuiAddress(options.packageId),
        moduleName: options.moduleName,
        name: options.name,
        visibility: parseVisibility(result.visibility),
        isEntry: result.isEntry,
        typeParameters: result.typeParameters.map((abilities) => ({
          isPhantom: false,
          constraints: parseAbilities(abilities)
        })),
        parameters: result.parameters.map((param) => parseNormalizedSuiMoveType(param)),
        returns: result.return.map((ret) => parseNormalizedSuiMoveType(ret))
      }
    };
  }
};
_jsonRpcClient = /* @__PURE__ */ new WeakMap();
function parseObject(object2) {
  return {
    id: object2.objectId,
    version: object2.version,
    digest: object2.digest,
    type: object2.type,
    content: Promise.resolve(
      object2.bcs?.dataType === "moveObject" ? fromBase64(object2.bcs.bcsBytes) : new Uint8Array()
    ),
    owner: parseOwner(object2.owner),
    previousTransaction: object2.previousTransaction ?? null
  };
}
__name(parseObject, "parseObject");
function parseOwner(owner) {
  if (owner === "Immutable") {
    return {
      $kind: "Immutable",
      Immutable: true
    };
  }
  if ("ConsensusAddressOwner" in owner) {
    return {
      $kind: "ConsensusAddressOwner",
      ConsensusAddressOwner: {
        owner: owner.ConsensusAddressOwner.owner,
        startVersion: owner.ConsensusAddressOwner.start_version
      }
    };
  }
  if ("AddressOwner" in owner) {
    return {
      $kind: "AddressOwner",
      AddressOwner: owner.AddressOwner
    };
  }
  if ("ObjectOwner" in owner) {
    return {
      $kind: "ObjectOwner",
      ObjectOwner: owner.ObjectOwner
    };
  }
  if ("Shared" in owner) {
    return {
      $kind: "Shared",
      Shared: {
        initialSharedVersion: owner.Shared.initial_shared_version
      }
    };
  }
  throw new Error(`Unknown owner type: ${JSON.stringify(owner)}`);
}
__name(parseOwner, "parseOwner");
function parseOwnerAddress(owner) {
  if (owner === "Immutable") {
    return null;
  }
  if ("ConsensusAddressOwner" in owner) {
    return owner.ConsensusAddressOwner.owner;
  }
  if ("AddressOwner" in owner) {
    return owner.AddressOwner;
  }
  if ("ObjectOwner" in owner) {
    return owner.ObjectOwner;
  }
  if ("Shared" in owner) {
    return null;
  }
  throw new Error(`Unknown owner type: ${JSON.stringify(owner)}`);
}
__name(parseOwnerAddress, "parseOwnerAddress");
function parseTransaction(transaction) {
  const parsedTx = suiBcs.SenderSignedData.parse(fromBase64(transaction.rawTransaction))[0];
  const objectTypes = {};
  transaction.objectChanges?.forEach((change) => {
    if (change.type !== "published") {
      objectTypes[change.objectId] = change.objectType;
    }
  });
  const bytes = suiBcs.TransactionData.serialize(parsedTx.intentMessage.value).toBytes();
  const data = TransactionDataBuilder.restore({
    version: 2,
    sender: parsedTx.intentMessage.value.V1.sender,
    expiration: parsedTx.intentMessage.value.V1.expiration,
    gasData: parsedTx.intentMessage.value.V1.gasData,
    inputs: parsedTx.intentMessage.value.V1.kind.ProgrammableTransaction.inputs,
    commands: parsedTx.intentMessage.value.V1.kind.ProgrammableTransaction.commands
  });
  return {
    digest: transaction.digest,
    epoch: transaction.effects?.executedEpoch ?? null,
    effects: parseTransactionEffectsBcs(new Uint8Array(transaction.rawEffects)),
    objectTypes: Promise.resolve(objectTypes),
    transaction: {
      ...data,
      bcs: bytes
    },
    signatures: parsedTx.txSignatures,
    balanceChanges: transaction.balanceChanges?.map((change) => ({
      coinType: change.coinType,
      address: parseOwnerAddress(change.owner),
      amount: change.amount
    })) ?? []
  };
}
__name(parseTransaction, "parseTransaction");
function parseTransactionEffectsJson({
  bytes,
  effects,
  objectChanges
}) {
  const changedObjects = [];
  const unchangedConsensusObjects = [];
  const objectTypes = {};
  objectChanges?.forEach((change) => {
    switch (change.type) {
      case "published":
        changedObjects.push({
          id: change.packageId,
          inputState: "DoesNotExist",
          inputVersion: null,
          inputDigest: null,
          inputOwner: null,
          outputState: "PackageWrite",
          outputVersion: change.version,
          outputDigest: change.digest,
          outputOwner: null,
          idOperation: "Created"
        });
        break;
      case "transferred":
        changedObjects.push({
          id: change.objectId,
          inputState: "Exists",
          inputVersion: change.version,
          inputDigest: change.digest,
          inputOwner: {
            $kind: "AddressOwner",
            AddressOwner: change.sender
          },
          outputState: "ObjectWrite",
          outputVersion: change.version,
          outputDigest: change.digest,
          outputOwner: parseOwner(change.recipient),
          idOperation: "None"
        });
        objectTypes[change.objectId] = change.objectType;
        break;
      case "mutated":
        changedObjects.push({
          id: change.objectId,
          inputState: "Exists",
          inputVersion: change.previousVersion,
          inputDigest: null,
          inputOwner: parseOwner(change.owner),
          outputState: "ObjectWrite",
          outputVersion: change.version,
          outputDigest: change.digest,
          outputOwner: parseOwner(change.owner),
          idOperation: "None"
        });
        objectTypes[change.objectId] = change.objectType;
        break;
      case "deleted":
        changedObjects.push({
          id: change.objectId,
          inputState: "Exists",
          inputVersion: change.version,
          inputDigest: effects.deleted?.find((d) => d.objectId === change.objectId)?.digest ?? null,
          inputOwner: null,
          outputState: "DoesNotExist",
          outputVersion: null,
          outputDigest: null,
          outputOwner: null,
          idOperation: "Deleted"
        });
        objectTypes[change.objectId] = change.objectType;
        break;
      case "wrapped":
        changedObjects.push({
          id: change.objectId,
          inputState: "Exists",
          inputVersion: change.version,
          inputDigest: null,
          inputOwner: {
            $kind: "AddressOwner",
            AddressOwner: change.sender
          },
          outputState: "ObjectWrite",
          outputVersion: change.version,
          outputDigest: effects.wrapped?.find((w) => w.objectId === change.objectId)?.digest ?? null,
          outputOwner: {
            $kind: "ObjectOwner",
            ObjectOwner: change.sender
          },
          idOperation: "None"
        });
        objectTypes[change.objectId] = change.objectType;
        break;
      case "created":
        changedObjects.push({
          id: change.objectId,
          inputState: "DoesNotExist",
          inputVersion: null,
          inputDigest: null,
          inputOwner: null,
          outputState: "ObjectWrite",
          outputVersion: change.version,
          outputDigest: change.digest,
          outputOwner: parseOwner(change.owner),
          idOperation: "Created"
        });
        objectTypes[change.objectId] = change.objectType;
        break;
    }
  });
  return {
    objectTypes,
    effects: {
      bcs: bytes ?? null,
      digest: effects.transactionDigest,
      version: 2,
      status: effects.status.status === "success" ? { success: true, error: null } : { success: false, error: effects.status.error },
      gasUsed: effects.gasUsed,
      transactionDigest: effects.transactionDigest,
      gasObject: {
        id: effects.gasObject?.reference.objectId,
        inputState: "Exists",
        inputVersion: null,
        inputDigest: null,
        inputOwner: null,
        outputState: "ObjectWrite",
        outputVersion: effects.gasObject.reference.version,
        outputDigest: effects.gasObject.reference.digest,
        outputOwner: parseOwner(effects.gasObject.owner),
        idOperation: "None"
      },
      eventsDigest: effects.eventsDigest ?? null,
      dependencies: effects.dependencies ?? [],
      lamportVersion: effects.gasObject.reference.version,
      changedObjects,
      unchangedConsensusObjects,
      auxiliaryDataDigest: null
    }
  };
}
__name(parseTransactionEffectsJson, "parseTransactionEffectsJson");
var Balance = suiBcs.struct("Balance", {
  value: suiBcs.u64()
});
var Coin = suiBcs.struct("Coin", {
  id: suiBcs.Address,
  balance: Balance
});
function parseNormalizedSuiMoveType(type) {
  if (typeof type !== "string") {
    if ("Reference" in type) {
      return {
        reference: "immutable",
        body: parseNormalizedSuiMoveTypeBody(type.Reference)
      };
    }
    if ("MutableReference" in type) {
      return {
        reference: "mutable",
        body: parseNormalizedSuiMoveTypeBody(type.MutableReference)
      };
    }
  }
  return {
    reference: null,
    body: parseNormalizedSuiMoveTypeBody(type)
  };
}
__name(parseNormalizedSuiMoveType, "parseNormalizedSuiMoveType");
function parseNormalizedSuiMoveTypeBody(type) {
  switch (type) {
    case "Address":
      return { $kind: "address" };
    case "Bool":
      return { $kind: "bool" };
    case "U8":
      return { $kind: "u8" };
    case "U16":
      return { $kind: "u16" };
    case "U32":
      return { $kind: "u32" };
    case "U64":
      return { $kind: "u64" };
    case "U128":
      return { $kind: "u128" };
    case "U256":
      return { $kind: "u256" };
  }
  if (typeof type === "string") {
    throw new Error(`Unknown type: ${type}`);
  }
  if ("Vector" in type) {
    return {
      $kind: "vector",
      vector: parseNormalizedSuiMoveTypeBody(type.Vector)
    };
  }
  if ("Struct" in type) {
    return {
      $kind: "datatype",
      datatype: {
        typeName: `${normalizeSuiAddress(type.Struct.address)}::${type.Struct.module}::${type.Struct.name}`,
        typeParameters: type.Struct.typeArguments.map((t) => parseNormalizedSuiMoveTypeBody(t))
      }
    };
  }
  if ("TypeParameter" in type) {
    return {
      $kind: "typeParameter",
      index: type.TypeParameter
    };
  }
  throw new Error(`Unknown type: ${JSON.stringify(type)}`);
}
__name(parseNormalizedSuiMoveTypeBody, "parseNormalizedSuiMoveTypeBody");
function parseAbilities(abilitySet) {
  return abilitySet.abilities.map((ability) => {
    switch (ability) {
      case "Copy":
        return "copy";
      case "Drop":
        return "drop";
      case "Store":
        return "store";
      case "Key":
        return "key";
      default:
        return "unknown";
    }
  });
}
__name(parseAbilities, "parseAbilities");
function parseVisibility(visibility) {
  switch (visibility) {
    case "Public":
      return "public";
    case "Private":
      return "private";
    case "Friend":
      return "friend";
    default:
      return "unknown";
  }
}
__name(parseVisibility, "parseVisibility");

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/jsonRpc/client.js
var SUI_CLIENT_BRAND = /* @__PURE__ */ Symbol.for("@mysten/SuiClient");
var SuiJsonRpcClient = class extends Experimental_BaseClient {
  static {
    __name(this, "SuiJsonRpcClient");
  }
  /**
   * Establish a connection to a Sui RPC endpoint
   *
   * @param options configuration options for the API Client
   */
  constructor(options) {
    super({ network: options.network ?? "unknown" });
    this.jsonRpc = this;
    this.transport = options.transport ?? new JsonRpcHTTPTransport({ url: options.url });
    this.core = new JSONRpcCoreClient({
      jsonRpcClient: this,
      mvr: options.mvr
    });
  }
  get [SUI_CLIENT_BRAND]() {
    return true;
  }
  async getRpcApiVersion({ signal } = {}) {
    const resp = await this.transport.request({
      method: "rpc.discover",
      params: [],
      signal
    });
    return resp.info.version;
  }
  /**
   * Get all Coin<`coin_type`> objects owned by an address.
   */
  async getCoins({
    coinType,
    owner,
    cursor,
    limit,
    signal
  }) {
    if (!owner || !isValidSuiAddress(normalizeSuiAddress(owner))) {
      throw new Error("Invalid Sui address");
    }
    if (coinType && hasMvrName(coinType)) {
      coinType = (await this.core.mvr.resolveType({
        type: coinType
      })).type;
    }
    return await this.transport.request({
      method: "suix_getCoins",
      params: [owner, coinType, cursor, limit],
      signal
    });
  }
  /**
   * Get all Coin objects owned by an address.
   */
  async getAllCoins(input) {
    if (!input.owner || !isValidSuiAddress(normalizeSuiAddress(input.owner))) {
      throw new Error("Invalid Sui address");
    }
    return await this.transport.request({
      method: "suix_getAllCoins",
      params: [input.owner, input.cursor, input.limit],
      signal: input.signal
    });
  }
  /**
   * Get the total coin balance for one coin type, owned by the address owner.
   */
  async getBalance({ owner, coinType, signal }) {
    if (!owner || !isValidSuiAddress(normalizeSuiAddress(owner))) {
      throw new Error("Invalid Sui address");
    }
    if (coinType && hasMvrName(coinType)) {
      coinType = (await this.core.mvr.resolveType({
        type: coinType
      })).type;
    }
    return await this.transport.request({
      method: "suix_getBalance",
      params: [owner, coinType],
      signal
    });
  }
  /**
   * Get the total coin balance for all coin types, owned by the address owner.
   */
  async getAllBalances(input) {
    if (!input.owner || !isValidSuiAddress(normalizeSuiAddress(input.owner))) {
      throw new Error("Invalid Sui address");
    }
    return await this.transport.request({
      method: "suix_getAllBalances",
      params: [input.owner],
      signal: input.signal
    });
  }
  /**
   * Fetch CoinMetadata for a given coin type
   */
  async getCoinMetadata({ coinType, signal }) {
    if (coinType && hasMvrName(coinType)) {
      coinType = (await this.core.mvr.resolveType({
        type: coinType
      })).type;
    }
    return await this.transport.request({
      method: "suix_getCoinMetadata",
      params: [coinType],
      signal
    });
  }
  /**
   *  Fetch total supply for a coin
   */
  async getTotalSupply({ coinType, signal }) {
    if (coinType && hasMvrName(coinType)) {
      coinType = (await this.core.mvr.resolveType({
        type: coinType
      })).type;
    }
    return await this.transport.request({
      method: "suix_getTotalSupply",
      params: [coinType],
      signal
    });
  }
  /**
   * Invoke any RPC method
   * @param method the method to be invoked
   * @param args the arguments to be passed to the RPC request
   */
  async call(method, params, { signal } = {}) {
    return await this.transport.request({ method, params, signal });
  }
  /**
   * Get Move function argument types like read, write and full access
   */
  async getMoveFunctionArgTypes({
    package: pkg,
    module,
    function: fn,
    signal
  }) {
    if (pkg && isValidNamedPackage(pkg)) {
      pkg = (await this.core.mvr.resolvePackage({
        package: pkg
      })).package;
    }
    return await this.transport.request({
      method: "sui_getMoveFunctionArgTypes",
      params: [pkg, module, fn],
      signal
    });
  }
  /**
   * Get a map from module name to
   * structured representations of Move modules
   */
  async getNormalizedMoveModulesByPackage({
    package: pkg,
    signal
  }) {
    if (pkg && isValidNamedPackage(pkg)) {
      pkg = (await this.core.mvr.resolvePackage({
        package: pkg
      })).package;
    }
    return await this.transport.request({
      method: "sui_getNormalizedMoveModulesByPackage",
      params: [pkg],
      signal
    });
  }
  /**
   * Get a structured representation of Move module
   */
  async getNormalizedMoveModule({
    package: pkg,
    module,
    signal
  }) {
    if (pkg && isValidNamedPackage(pkg)) {
      pkg = (await this.core.mvr.resolvePackage({
        package: pkg
      })).package;
    }
    return await this.transport.request({
      method: "sui_getNormalizedMoveModule",
      params: [pkg, module],
      signal
    });
  }
  /**
   * Get a structured representation of Move function
   */
  async getNormalizedMoveFunction({
    package: pkg,
    module,
    function: fn,
    signal
  }) {
    if (pkg && isValidNamedPackage(pkg)) {
      pkg = (await this.core.mvr.resolvePackage({
        package: pkg
      })).package;
    }
    return await this.transport.request({
      method: "sui_getNormalizedMoveFunction",
      params: [pkg, module, fn],
      signal
    });
  }
  /**
   * Get a structured representation of Move struct
   */
  async getNormalizedMoveStruct({
    package: pkg,
    module,
    struct,
    signal
  }) {
    if (pkg && isValidNamedPackage(pkg)) {
      pkg = (await this.core.mvr.resolvePackage({
        package: pkg
      })).package;
    }
    return await this.transport.request({
      method: "sui_getNormalizedMoveStruct",
      params: [pkg, module, struct],
      signal
    });
  }
  /**
   * Get all objects owned by an address
   */
  async getOwnedObjects(input) {
    if (!input.owner || !isValidSuiAddress(normalizeSuiAddress(input.owner))) {
      throw new Error("Invalid Sui address");
    }
    const filter = input.filter ? {
      ...input.filter
    } : void 0;
    if (filter && "MoveModule" in filter && isValidNamedPackage(filter.MoveModule.package)) {
      filter.MoveModule = {
        module: filter.MoveModule.module,
        package: (await this.core.mvr.resolvePackage({
          package: filter.MoveModule.package
        })).package
      };
    } else if (filter && "StructType" in filter && hasMvrName(filter.StructType)) {
      filter.StructType = (await this.core.mvr.resolveType({
        type: filter.StructType
      })).type;
    }
    return await this.transport.request({
      method: "suix_getOwnedObjects",
      params: [
        input.owner,
        {
          filter,
          options: input.options
        },
        input.cursor,
        input.limit
      ],
      signal: input.signal
    });
  }
  /**
   * Get details about an object
   */
  async getObject(input) {
    if (!input.id || !isValidSuiObjectId(normalizeSuiObjectId(input.id))) {
      throw new Error("Invalid Sui Object id");
    }
    return await this.transport.request({
      method: "sui_getObject",
      params: [input.id, input.options],
      signal: input.signal
    });
  }
  async tryGetPastObject(input) {
    return await this.transport.request({
      method: "sui_tryGetPastObject",
      params: [input.id, input.version, input.options],
      signal: input.signal
    });
  }
  /**
   * Batch get details about a list of objects. If any of the object ids are duplicates the call will fail
   */
  async multiGetObjects(input) {
    input.ids.forEach((id) => {
      if (!id || !isValidSuiObjectId(normalizeSuiObjectId(id))) {
        throw new Error(`Invalid Sui Object id ${id}`);
      }
    });
    const hasDuplicates = input.ids.length !== new Set(input.ids).size;
    if (hasDuplicates) {
      throw new Error(`Duplicate object ids in batch call ${input.ids}`);
    }
    return await this.transport.request({
      method: "sui_multiGetObjects",
      params: [input.ids, input.options],
      signal: input.signal
    });
  }
  /**
   * Get transaction blocks for a given query criteria
   */
  async queryTransactionBlocks({
    filter,
    options,
    cursor,
    limit,
    order,
    signal
  }) {
    if (filter && "MoveFunction" in filter && isValidNamedPackage(filter.MoveFunction.package)) {
      filter = {
        ...filter,
        MoveFunction: {
          package: (await this.core.mvr.resolvePackage({
            package: filter.MoveFunction.package
          })).package
        }
      };
    }
    return await this.transport.request({
      method: "suix_queryTransactionBlocks",
      params: [
        {
          filter,
          options
        },
        cursor,
        limit,
        (order || "descending") === "descending"
      ],
      signal
    });
  }
  async getTransactionBlock(input) {
    if (!isValidTransactionDigest(input.digest)) {
      throw new Error("Invalid Transaction digest");
    }
    return await this.transport.request({
      method: "sui_getTransactionBlock",
      params: [input.digest, input.options],
      signal: input.signal
    });
  }
  async multiGetTransactionBlocks(input) {
    input.digests.forEach((d) => {
      if (!isValidTransactionDigest(d)) {
        throw new Error(`Invalid Transaction digest ${d}`);
      }
    });
    const hasDuplicates = input.digests.length !== new Set(input.digests).size;
    if (hasDuplicates) {
      throw new Error(`Duplicate digests in batch call ${input.digests}`);
    }
    return await this.transport.request({
      method: "sui_multiGetTransactionBlocks",
      params: [input.digests, input.options],
      signal: input.signal
    });
  }
  async executeTransactionBlock({
    transactionBlock,
    signature,
    options,
    requestType,
    signal
  }) {
    const result = await this.transport.request({
      method: "sui_executeTransactionBlock",
      params: [
        typeof transactionBlock === "string" ? transactionBlock : toBase64(transactionBlock),
        Array.isArray(signature) ? signature : [signature],
        options
      ],
      signal
    });
    if (requestType === "WaitForLocalExecution") {
      try {
        await this.waitForTransaction({
          digest: result.digest
        });
      } catch {
      }
    }
    return result;
  }
  async signAndExecuteTransaction({
    transaction,
    signer,
    ...input
  }) {
    let transactionBytes;
    if (transaction instanceof Uint8Array) {
      transactionBytes = transaction;
    } else {
      transaction.setSenderIfNotSet(signer.toSuiAddress());
      transactionBytes = await transaction.build({ client: this });
    }
    const { signature, bytes } = await signer.signTransaction(transactionBytes);
    return this.executeTransactionBlock({
      transactionBlock: bytes,
      signature,
      ...input
    });
  }
  /**
   * Get total number of transactions
   */
  async getTotalTransactionBlocks({ signal } = {}) {
    const resp = await this.transport.request({
      method: "sui_getTotalTransactionBlocks",
      params: [],
      signal
    });
    return BigInt(resp);
  }
  /**
   * Getting the reference gas price for the network
   */
  async getReferenceGasPrice({ signal } = {}) {
    const resp = await this.transport.request({
      method: "suix_getReferenceGasPrice",
      params: [],
      signal
    });
    return BigInt(resp);
  }
  /**
   * Return the delegated stakes for an address
   */
  async getStakes(input) {
    if (!input.owner || !isValidSuiAddress(normalizeSuiAddress(input.owner))) {
      throw new Error("Invalid Sui address");
    }
    return await this.transport.request({
      method: "suix_getStakes",
      params: [input.owner],
      signal: input.signal
    });
  }
  /**
   * Return the delegated stakes queried by id.
   */
  async getStakesByIds(input) {
    input.stakedSuiIds.forEach((id) => {
      if (!id || !isValidSuiObjectId(normalizeSuiObjectId(id))) {
        throw new Error(`Invalid Sui Stake id ${id}`);
      }
    });
    return await this.transport.request({
      method: "suix_getStakesByIds",
      params: [input.stakedSuiIds],
      signal: input.signal
    });
  }
  /**
   * Return the latest system state content.
   */
  async getLatestSuiSystemState({
    signal
  } = {}) {
    return await this.transport.request({
      method: "suix_getLatestSuiSystemState",
      params: [],
      signal
    });
  }
  /**
   * Get events for a given query criteria
   */
  async queryEvents({
    query,
    cursor,
    limit,
    order,
    signal
  }) {
    if (query && "MoveEventType" in query && hasMvrName(query.MoveEventType)) {
      query = {
        ...query,
        MoveEventType: (await this.core.mvr.resolveType({
          type: query.MoveEventType
        })).type
      };
    }
    if (query && "MoveEventModule" in query && isValidNamedPackage(query.MoveEventModule.package)) {
      query = {
        ...query,
        MoveEventModule: {
          module: query.MoveEventModule.module,
          package: (await this.core.mvr.resolvePackage({
            package: query.MoveEventModule.package
          })).package
        }
      };
    }
    if ("MoveModule" in query && isValidNamedPackage(query.MoveModule.package)) {
      query = {
        ...query,
        MoveModule: {
          module: query.MoveModule.module,
          package: (await this.core.mvr.resolvePackage({
            package: query.MoveModule.package
          })).package
        }
      };
    }
    return await this.transport.request({
      method: "suix_queryEvents",
      params: [query, cursor, limit, (order || "descending") === "descending"],
      signal
    });
  }
  /**
   * Subscribe to get notifications whenever an event matching the filter occurs
   *
   * @deprecated
   */
  async subscribeEvent(input) {
    return this.transport.subscribe({
      method: "suix_subscribeEvent",
      unsubscribe: "suix_unsubscribeEvent",
      params: [input.filter],
      onMessage: input.onMessage,
      signal: input.signal
    });
  }
  /**
   * @deprecated
   */
  async subscribeTransaction(input) {
    return this.transport.subscribe({
      method: "suix_subscribeTransaction",
      unsubscribe: "suix_unsubscribeTransaction",
      params: [input.filter],
      onMessage: input.onMessage,
      signal: input.signal
    });
  }
  /**
   * Runs the transaction block in dev-inspect mode. Which allows for nearly any
   * transaction (or Move call) with any arguments. Detailed results are
   * provided, including both the transaction effects and any return values.
   */
  async devInspectTransactionBlock(input) {
    let devInspectTxBytes;
    if (isTransaction(input.transactionBlock)) {
      input.transactionBlock.setSenderIfNotSet(input.sender);
      devInspectTxBytes = toBase64(
        await input.transactionBlock.build({
          client: this,
          onlyTransactionKind: true
        })
      );
    } else if (typeof input.transactionBlock === "string") {
      devInspectTxBytes = input.transactionBlock;
    } else if (input.transactionBlock instanceof Uint8Array) {
      devInspectTxBytes = toBase64(input.transactionBlock);
    } else {
      throw new Error("Unknown transaction block format.");
    }
    input.signal?.throwIfAborted();
    return await this.transport.request({
      method: "sui_devInspectTransactionBlock",
      params: [input.sender, devInspectTxBytes, input.gasPrice?.toString(), input.epoch],
      signal: input.signal
    });
  }
  /**
   * Dry run a transaction block and return the result.
   */
  async dryRunTransactionBlock(input) {
    return await this.transport.request({
      method: "sui_dryRunTransactionBlock",
      params: [
        typeof input.transactionBlock === "string" ? input.transactionBlock : toBase64(input.transactionBlock)
      ]
    });
  }
  /**
   * Return the list of dynamic field objects owned by an object
   */
  async getDynamicFields(input) {
    if (!input.parentId || !isValidSuiObjectId(normalizeSuiObjectId(input.parentId))) {
      throw new Error("Invalid Sui Object id");
    }
    return await this.transport.request({
      method: "suix_getDynamicFields",
      params: [input.parentId, input.cursor, input.limit],
      signal: input.signal
    });
  }
  /**
   * Return the dynamic field object information for a specified object
   */
  async getDynamicFieldObject(input) {
    return await this.transport.request({
      method: "suix_getDynamicFieldObject",
      params: [input.parentId, input.name],
      signal: input.signal
    });
  }
  /**
   * Get the sequence number of the latest checkpoint that has been executed
   */
  async getLatestCheckpointSequenceNumber({
    signal
  } = {}) {
    const resp = await this.transport.request({
      method: "sui_getLatestCheckpointSequenceNumber",
      params: [],
      signal
    });
    return String(resp);
  }
  /**
   * Returns information about a given checkpoint
   */
  async getCheckpoint(input) {
    return await this.transport.request({
      method: "sui_getCheckpoint",
      params: [input.id],
      signal: input.signal
    });
  }
  /**
   * Returns historical checkpoints paginated
   */
  async getCheckpoints(input) {
    return await this.transport.request({
      method: "sui_getCheckpoints",
      params: [input.cursor, input?.limit, input.descendingOrder],
      signal: input.signal
    });
  }
  /**
   * Return the committee information for the asked epoch
   */
  async getCommitteeInfo(input) {
    return await this.transport.request({
      method: "suix_getCommitteeInfo",
      params: [input?.epoch],
      signal: input?.signal
    });
  }
  async getNetworkMetrics({ signal } = {}) {
    return await this.transport.request({
      method: "suix_getNetworkMetrics",
      params: [],
      signal
    });
  }
  async getAddressMetrics({ signal } = {}) {
    return await this.transport.request({
      method: "suix_getLatestAddressMetrics",
      params: [],
      signal
    });
  }
  async getEpochMetrics(input) {
    return await this.transport.request({
      method: "suix_getEpochMetrics",
      params: [input?.cursor, input?.limit, input?.descendingOrder],
      signal: input?.signal
    });
  }
  async getAllEpochAddressMetrics(input) {
    return await this.transport.request({
      method: "suix_getAllEpochAddressMetrics",
      params: [input?.descendingOrder],
      signal: input?.signal
    });
  }
  /**
   * Return the committee information for the asked epoch
   */
  async getEpochs(input) {
    return await this.transport.request({
      method: "suix_getEpochs",
      params: [input?.cursor, input?.limit, input?.descendingOrder],
      signal: input?.signal
    });
  }
  /**
   * Returns list of top move calls by usage
   */
  async getMoveCallMetrics({ signal } = {}) {
    return await this.transport.request({
      method: "suix_getMoveCallMetrics",
      params: [],
      signal
    });
  }
  /**
   * Return the committee information for the asked epoch
   */
  async getCurrentEpoch({ signal } = {}) {
    return await this.transport.request({
      method: "suix_getCurrentEpoch",
      params: [],
      signal
    });
  }
  /**
   * Return the Validators APYs
   */
  async getValidatorsApy({ signal } = {}) {
    return await this.transport.request({
      method: "suix_getValidatorsApy",
      params: [],
      signal
    });
  }
  // TODO: Migrate this to `sui_getChainIdentifier` once it is widely available.
  async getChainIdentifier({ signal } = {}) {
    const checkpoint = await this.getCheckpoint({ id: "0", signal });
    const bytes = fromBase58(checkpoint.digest);
    return toHex(bytes.slice(0, 4));
  }
  async resolveNameServiceAddress(input) {
    return await this.transport.request({
      method: "suix_resolveNameServiceAddress",
      params: [input.name],
      signal: input.signal
    });
  }
  async resolveNameServiceNames({
    format = "dot",
    ...input
  }) {
    const { nextCursor, hasNextPage, data } = await this.transport.request({
      method: "suix_resolveNameServiceNames",
      params: [input.address, input.cursor, input.limit],
      signal: input.signal
    });
    return {
      hasNextPage,
      nextCursor,
      data: data.map((name) => normalizeSuiNSName(name, format))
    };
  }
  async getProtocolConfig(input) {
    return await this.transport.request({
      method: "sui_getProtocolConfig",
      params: [input?.version],
      signal: input?.signal
    });
  }
  async verifyZkLoginSignature(input) {
    return await this.transport.request({
      method: "sui_verifyZkLoginSignature",
      params: [input.bytes, input.signature, input.intentScope, input.author],
      signal: input.signal
    });
  }
  /**
   * Wait for a transaction block result to be available over the API.
   * This can be used in conjunction with `executeTransactionBlock` to wait for the transaction to
   * be available via the API.
   * This currently polls the `getTransactionBlock` API to check for the transaction.
   */
  async waitForTransaction({
    signal,
    timeout = 60 * 1e3,
    pollInterval = 2 * 1e3,
    ...input
  }) {
    const timeoutSignal = AbortSignal.timeout(timeout);
    const timeoutPromise = new Promise((_, reject) => {
      timeoutSignal.addEventListener("abort", () => reject(timeoutSignal.reason));
    });
    timeoutPromise.catch(() => {
    });
    while (!timeoutSignal.aborted) {
      signal?.throwIfAborted();
      try {
        return await this.getTransactionBlock(input);
      } catch {
        await Promise.race([
          new Promise((resolve) => setTimeout(resolve, pollInterval)),
          timeoutPromise
        ]);
      }
    }
    timeoutSignal.throwIfAborted();
    throw new Error("Unexpected error while waiting for transaction block.");
  }
};

// src/gasStationDO.ts
init_ed255192();

// ../../packages/gas-station-core/dist/index.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// ../../packages/gas-station-core/dist/gasMath.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function netGasFromEffects(gasUsed) {
  return BigInt(gasUsed.computationCost ?? 0) + BigInt(gasUsed.storageCost ?? 0) - BigInt(gasUsed.storageRebate ?? 0);
}
__name(netGasFromEffects, "netGasFromEffects");
function resolveGasBudget(netGas, cap, buffer) {
  const withBuffer = netGas + buffer;
  return withBuffer < cap ? withBuffer : cap;
}
__name(resolveGasBudget, "resolveGasBudget");
function parseEnvBigInt(env2, name, fallback) {
  const raw = env2[name];
  if (!raw)
    return fallback;
  const cleaned = raw.replace(/_/g, "").replace(/,/g, "").trim();
  try {
    return BigInt(cleaned);
  } catch {
    return fallback;
  }
}
__name(parseEnvBigInt, "parseEnvBigInt");

// ../../packages/gas-station-core/dist/gasConfig.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var DEFAULT_GAS_BUDGET_CAP_MIST = 100000000n;
var DEFAULT_GAS_BUDGET_BUFFER_MIST = 2000000n;
var DEFAULT_HEALTH_MIN_CAP_MULTIPLIER = 5n;
var DEFAULT_MIN_GAS_COMPENSATION = 100000000n;
var DEFAULT_MAX_PLATFORM_CLAIM_GAS_MIST = 30000000n;
function parseEnvNumber(env2, name, fallback) {
  const raw = env2[name];
  if (!raw)
    return fallback;
  const n = Number(raw.replace(/_/g, "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
__name(parseEnvNumber, "parseEnvNumber");
function parseCoinMergeThresholdMist(env2) {
  const raw = env2.COIN_MERGE_THRESHOLD_SUI;
  if (!raw)
    return 100000000n;
  const sui = parseFloat(raw.replace(/_/g, "").replace(/,/g, "").trim());
  if (!Number.isFinite(sui) || sui < 0)
    return 100000000n;
  return BigInt(Math.floor(sui * 1e9));
}
__name(parseCoinMergeThresholdMist, "parseCoinMergeThresholdMist");
function loadGasConfig(env2 = {}) {
  const minGasCompensationAmount = parseEnvBigInt(env2, "MIN_GAS_COMPENSATION_AMOUNT", parseEnvBigInt(env2, "GAS_COMPENSATION_AMOUNT", DEFAULT_MIN_GAS_COMPENSATION));
  return {
    gasBudgetCapMist: parseEnvBigInt(env2, "GAS_BUDGET_CAP_MIST", DEFAULT_GAS_BUDGET_CAP_MIST),
    gasBudgetBufferMist: parseEnvBigInt(env2, "GAS_BUDGET_BUFFER_MIST", DEFAULT_GAS_BUDGET_BUFFER_MIST),
    healthMinCapMultiplier: parseEnvBigInt(env2, "GAS_HEALTH_MIN_CAP_MULTIPLIER", DEFAULT_HEALTH_MIN_CAP_MULTIPLIER),
    minGasCompensationAmount,
    maxPlatformClaimGasMist: parseEnvBigInt(env2, "MAX_PLATFORM_CLAIM_GAS_MIST", DEFAULT_MAX_PLATFORM_CLAIM_GAS_MIST),
    platformSponsorDailyLimit: parseEnvNumber(env2, "PLATFORM_SPONSOR_DAILY_LIMIT", 3),
    minPlatformSponsorTier: parseEnvNumber(env2, "MIN_PLATFORM_SPONSOR_TIER", 0),
    gasSponsorRateLimitMax: parseEnvNumber(env2, "GAS_SPONSOR_RATE_LIMIT_MAX", 2),
    gasSponsorRateLimitWindowMs: parseEnvNumber(env2, "GAS_SPONSOR_RATE_LIMIT_WINDOW_MS", 6e4),
    gasSponsorRateLimitMaxPerWallet: parseEnvNumber(env2, "GAS_SPONSOR_RATE_LIMIT_MAX_PER_WALLET", 5),
    gasSponsorRateLimitWalletWindowMs: parseEnvNumber(env2, "GAS_SPONSOR_RATE_LIMIT_WALLET_WINDOW_MS", 6e4),
    coinMergeThresholdMist: parseCoinMergeThresholdMist(env2),
    coinMergeTriggerCount: parseEnvNumber(env2, "COIN_MERGE_TRIGGER_COUNT", 50),
    coinMergeIntervalMs: parseEnvNumber(env2, "COIN_MERGE_INTERVAL_MS", 36e5),
    coinQueueLockTtlMs: parseEnvNumber(env2, "COIN_QUEUE_LOCK_TTL_MS", 3e4),
    coinQueueAcquireRetries: parseEnvNumber(env2, "COIN_QUEUE_ACQUIRE_RETRIES", 3),
    coinInventoryRefreshMs: parseEnvNumber(env2, "COIN_INVENTORY_REFRESH_MS", 5e3)
  };
}
__name(loadGasConfig, "loadGasConfig");

// ../../packages/gas-station-core/dist/types.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// ../../packages/gas-station-core/dist/inMemoryCoinLockStore.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// ../../packages/gas-station-core/dist/mergeCoins.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// ../../node_modules/.pnpm/@mysten+sui@1.45.2_typescript@5.9.3/node_modules/@mysten/sui/dist/esm/transactions/index.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// ../../packages/gas-station-core/dist/mergeCoins.js
async function checkAndMergeCoins(config2) {
  const { suiClient, sponsorKeypair, thresholdMist = 100000000n, triggerCount = 50, lockedCoinIds = /* @__PURE__ */ new Set() } = config2;
  const sponsorAddress = sponsorKeypair.getPublicKey().toSuiAddress();
  const allCoins = [];
  let cursor = void 0;
  try {
    do {
      const res = await suiClient.getCoins({
        owner: sponsorAddress,
        coinType: "0x2::sui::SUI",
        cursor
      });
      allCoins.push(...res.data);
      cursor = res.hasNextPage ? res.nextCursor : null;
    } while (cursor);
  } catch (err) {
    console.error("[CoinMerge] Failed to fetch coins:", err);
    return false;
  }
  if (allCoins.length === 0)
    return false;
  const sortedCoins = [...allCoins].sort((a, b) => {
    const balA = BigInt(a.balance);
    const balB = BigInt(b.balance);
    return balA > balB ? -1 : balA < balB ? 1 : 0;
  });
  const gasCoin = sortedCoins.find((c) => !lockedCoinIds.has(c.coinObjectId));
  if (!gasCoin)
    return false;
  const smallCoins = sortedCoins.filter((c) => c.coinObjectId !== gasCoin.coinObjectId).filter((c) => !lockedCoinIds.has(c.coinObjectId)).filter((c) => BigInt(c.balance) <= thresholdMist);
  if (smallCoins.length < triggerCount)
    return false;
  try {
    const tx = new Transaction();
    tx.setSender(sponsorAddress);
    tx.setGasPayment([
      {
        objectId: gasCoin.coinObjectId,
        version: gasCoin.version,
        digest: gasCoin.digest
      }
    ]);
    tx.setGasBudget(2e7);
    const primaryCoinId = smallCoins[0].coinObjectId;
    const mergeTargets = smallCoins.slice(1, 101).map((c) => c.coinObjectId);
    tx.mergeCoins(tx.object(primaryCoinId), mergeTargets.map((id) => tx.object(id)));
    await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: sponsorKeypair
    });
    console.log(`[CoinMerge] Merged ${mergeTargets.length + 1} SUI coins into ${primaryCoinId}`);
    return true;
  } catch (err) {
    console.error("[CoinMerge] Failed to execute merge transaction:", err);
    return false;
  }
}
__name(checkAndMergeCoins, "checkAndMergeCoins");

// ../../packages/gas-station-core/dist/sponsorPipeline.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function emptyMetrics(partial = {}) {
  return {
    queueWaitMs: 0,
    dryRunMs: 0,
    outcome: "error",
    ...partial
  };
}
__name(emptyMetrics, "emptyMetrics");
async function runSponsorPipeline(params) {
  const { txBytes, senderAddress, suiClient, keypair, sponsorAddress, coinStore, gasConfig, context: context2, onPlatformSponsorSigned, onPassSponsorSigned } = params;
  const queueStart = Date.now();
  const tx = Transaction.fromKind(Buffer.from(txBytes, "base64"));
  tx.setSender(senderAddress);
  tx.setGasOwner(sponsorAddress);
  let gasBudgetMist = gasConfig.gasBudgetCapMist;
  let acquiredCoin;
  try {
    try {
      acquiredCoin = await coinStore.acquire(suiClient, sponsorAddress, gasBudgetMist);
    } catch (err) {
      if (err instanceof Error && err.message === "sponsor_coin_unavailable") {
        return {
          ok: false,
          status: 503,
          error: "sponsor_coin_unavailable",
          message: "No sponsor gas coin available; try again shortly",
          metrics: emptyMetrics({
            queueWaitMs: Date.now() - queueStart,
            outcome: "sponsor_coin_unavailable"
          })
        };
      }
      throw err;
    }
    const queueWaitMs = Date.now() - queueStart;
    try {
      tx.setGasPayment([
        {
          objectId: acquiredCoin.coinObjectId,
          version: acquiredCoin.version,
          digest: acquiredCoin.digest
        }
      ]);
      tx.setGasBudget(Number(gasBudgetMist));
      let sponsoredTxBytes = await tx.build({ client: suiClient });
      const dryRunStart = Date.now();
      let dryRun = await suiClient.dryRunTransactionBlock({
        transactionBlock: Buffer.from(sponsoredTxBytes).toString("base64")
      });
      if (dryRun.effects.status.status === "failure") {
        return {
          ok: false,
          status: 422,
          error: "dry_run_failed",
          message: dryRun.effects.status.error ?? "Dry run failed",
          metrics: emptyMetrics({
            queueWaitMs,
            dryRunMs: Date.now() - dryRunStart,
            coinObjectId: acquiredCoin.coinObjectId,
            outcome: "dry_run_failed"
          })
        };
      }
      const netGas = netGasFromEffects(dryRun.effects.gasUsed);
      const claimGasCompensationAmount = context2.claimGasCompensationAmount ? BigInt(context2.claimGasCompensationAmount) : null;
      const claimStorageCompensationAmount = context2.claimStorageCompensationAmount ? BigInt(context2.claimStorageCompensationAmount) : null;
      if (!context2.isPassSponsor) {
        if (context2.isPlatformSponsor) {
          if (netGas > gasConfig.maxPlatformClaimGasMist) {
            return {
              ok: false,
              status: 422,
              error: "gas_exceeds_compensation",
              message: `Estimated gas ${netGas} exceeds platform claim cap ${gasConfig.maxPlatformClaimGasMist}`,
              metrics: emptyMetrics({
                queueWaitMs,
                dryRunMs: Date.now() - dryRunStart,
                coinObjectId: acquiredCoin.coinObjectId,
                outcome: "gas_exceeds_compensation"
              })
            };
          }
        } else if (claimGasCompensationAmount !== null) {
          const compensation = claimGasCompensationAmount + (context2.claimHasBlob && claimStorageCompensationAmount !== null ? claimStorageCompensationAmount : 0n);
          const required = netGas + gasConfig.gasBudgetBufferMist;
          if (required > compensation) {
            return {
              ok: false,
              status: 422,
              error: "gas_exceeds_compensation",
              message: `Estimated netGas+buffer ${required} exceeds vault compensation ${compensation}`,
              metrics: emptyMetrics({
                queueWaitMs,
                dryRunMs: Date.now() - dryRunStart,
                coinObjectId: acquiredCoin.coinObjectId,
                outcome: "gas_exceeds_compensation"
              })
            };
          }
        }
      }
      const refinedBudget = resolveGasBudget(netGas, gasConfig.gasBudgetCapMist, gasConfig.gasBudgetBufferMist);
      if (refinedBudget < gasBudgetMist) {
        gasBudgetMist = refinedBudget;
        tx.setGasBudget(Number(gasBudgetMist));
        sponsoredTxBytes = await tx.build({ client: suiClient });
        dryRun = await suiClient.dryRunTransactionBlock({
          transactionBlock: Buffer.from(sponsoredTxBytes).toString("base64")
        });
        if (dryRun.effects.status.status === "failure") {
          return {
            ok: false,
            status: 422,
            error: "dry_run_failed",
            message: dryRun.effects.status.error ?? "Dry run failed after budget refine",
            metrics: emptyMetrics({
              queueWaitMs,
              dryRunMs: Date.now() - dryRunStart,
              coinObjectId: acquiredCoin.coinObjectId,
              outcome: "dry_run_failed"
            })
          };
        }
      }
      const signatureResult = await keypair.signTransaction(sponsoredTxBytes);
      const dryRunMs = Date.now() - dryRunStart;
      if (context2.isPlatformSponsor && onPlatformSponsorSigned) {
        await onPlatformSponsorSigned();
      }
      if (context2.isPassSponsor && onPassSponsorSigned) {
        onPassSponsorSigned();
      }
      return {
        ok: true,
        result: {
          sponsoredTxBytes: Buffer.from(sponsoredTxBytes).toString("base64"),
          sponsorSignature: signatureResult.signature
        },
        metrics: {
          queueWaitMs,
          dryRunMs,
          coinObjectId: acquiredCoin.coinObjectId,
          outcome: "success"
        }
      };
    } finally {
      if (acquiredCoin) {
        coinStore.release(acquiredCoin.coinObjectId);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 500,
      error: "sponsor_failed",
      message,
      metrics: emptyMetrics({ queueWaitMs: Date.now() - queueStart })
    };
  }
}
__name(runSponsorPipeline, "runSponsorPipeline");

// ../../packages/gas-station-core/dist/platformSponsorStore.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// ../../packages/gas-station-core/dist/walletRateLimitStore.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// ../../packages/gas-station-core/dist/signerBackend.js
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// src/durableObjectCoinLockStore.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
var DurableObjectCoinLockStore = class {
  constructor(storage, lockTtlMs, acquireRetries, inventoryRefreshMs) {
    this.storage = storage;
    this.lockTtlMs = lockTtlMs;
    this.acquireRetries = acquireRetries;
    this.inventoryRefreshMs = inventoryRefreshMs;
  }
  static {
    __name(this, "DurableObjectCoinLockStore");
  }
  state = { locks: {}, lastInventoryFetch: 0, cachedCoins: [] };
  async load() {
    const stored = await this.storage.get("coinState");
    if (stored) this.state = stored;
  }
  async persist() {
    await this.storage.put("coinState", this.state);
  }
  isLocked(coinObjectId, now = Date.now()) {
    this.pruneExpired(now);
    const entry = this.state.locks[coinObjectId];
    return entry !== void 0 && entry.expiresAt > now;
  }
  getLockedCoinIds(now = Date.now()) {
    this.pruneExpired(now);
    const ids = /* @__PURE__ */ new Set();
    for (const [id, entry] of Object.entries(this.state.locks)) {
      if (entry.expiresAt > now) ids.add(id);
    }
    return ids;
  }
  release(coinObjectId) {
    delete this.state.locks[coinObjectId];
    void this.persist();
  }
  lock(coinObjectId, now = Date.now()) {
    this.state.locks[coinObjectId] = { expiresAt: now + this.lockTtlMs };
    void this.persist();
  }
  pruneExpired(now) {
    for (const [id, entry] of Object.entries(this.state.locks)) {
      if (entry.expiresAt <= now) delete this.state.locks[id];
    }
  }
  async fetchAllCoins(suiClient, owner, force = false) {
    const now = Date.now();
    if (!force && this.state.cachedCoins.length > 0 && now - this.state.lastInventoryFetch < this.inventoryRefreshMs) {
      return this.state.cachedCoins;
    }
    const all = [];
    let cursor = void 0;
    do {
      const res = await suiClient.getCoins({ owner, coinType: "0x2::sui::SUI", cursor });
      all.push(...res.data);
      cursor = res.hasNextPage ? res.nextCursor : null;
    } while (cursor);
    this.state.cachedCoins = all;
    this.state.lastInventoryFetch = now;
    await this.persist();
    return all;
  }
  pickCoin(coins, minBalanceMist, now) {
    const eligible = coins.filter((c) => !this.isLocked(c.coinObjectId, now)).filter((c) => BigInt(c.balance) >= minBalanceMist).sort((a, b) => {
      const balA = BigInt(a.balance);
      const balB = BigInt(b.balance);
      return balA > balB ? -1 : balA < balB ? 1 : 0;
    });
    return eligible[0] ?? null;
  }
  async acquire(suiClient, owner, minBalanceMist) {
    const backoffMs = 50;
    let lastError = null;
    for (let attempt = 0; attempt <= this.acquireRetries; attempt++) {
      const now = Date.now();
      this.pruneExpired(now);
      let coins;
      try {
        coins = await this.fetchAllCoins(suiClient, owner, attempt > 0);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.acquireRetries) {
          await sleep(backoffMs * (attempt + 1));
          continue;
        }
        throw lastError;
      }
      const picked = this.pickCoin(coins, minBalanceMist, now);
      if (!picked) {
        lastError = new Error("sponsor_coin_unavailable");
        if (attempt < this.acquireRetries) {
          await sleep(backoffMs * (attempt + 1));
          continue;
        }
        throw lastError;
      }
      this.lock(picked.coinObjectId, now);
      return {
        coinObjectId: picked.coinObjectId,
        version: picked.version,
        digest: picked.digest,
        balance: BigInt(picked.balance)
      };
    }
    throw lastError ?? new Error("sponsor_coin_unavailable");
  }
};
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
__name(sleep, "sleep");

// src/d1Stores.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
async function ensureD1Schema(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS platform_sponsor_daily (
        sender_address TEXT NOT NULL,
        day TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (sender_address, day)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS wallet_sponsor_rate (
        sender_address TEXT NOT NULL,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (sender_address, window_start)
      )
    `)
  ]);
}
__name(ensureD1Schema, "ensureD1Schema");

// src/gasStationDO.ts
var GasStationDO = class {
  constructor(state, env2) {
    this.state = state;
    this.env = env2;
    const gasConfig = loadGasConfig(this.env);
    this.coinStore = new DurableObjectCoinLockStore(
      this.state.storage,
      gasConfig.coinQueueLockTtlMs,
      gasConfig.coinQueueAcquireRetries,
      gasConfig.coinInventoryRefreshMs
    );
    void this.state.blockConcurrencyWhile(async () => {
      await this.coinStore.load();
      if (this.env.DB) await ensureD1Schema(this.env.DB);
      const gasConfig2 = loadGasConfig(this.env);
      const intervalMs = gasConfig2.coinMergeIntervalMs;
      const existing = await this.state.storage.get("nextMergeAlarm");
      if (!existing) {
        await this.state.storage.setAlarm(Date.now() + intervalMs);
      }
    });
  }
  static {
    __name(this, "GasStationDO");
  }
  processing = false;
  pending = [];
  coinStore;
  metrics = { queueDepth: 0, lockedCoinCount: 0, unlockedCoinCount: 0 };
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(await this.health());
    }
    if (request.method !== "POST" || url.pathname !== "/sponsor") {
      return new Response("Not found", { status: 404 });
    }
    const body = await request.json();
    return new Promise((resolve) => {
      this.pending.push({ body, resolve });
      this.metrics.queueDepth = this.pending.length;
      void this.drainQueue();
    });
  }
  async alarm() {
    const privKeyHex = this.env.SURVEY_PASS_ISSUER_PRIV;
    if (!privKeyHex) return;
    const gasConfig = loadGasConfig(this.env);
    const keypair = keypairFromHex(privKeyHex);
    const suiClient = new SuiJsonRpcClient({ url: this.env.SUI_RPC_URL });
    await checkAndMergeCoins({
      suiClient,
      sponsorKeypair: keypair,
      thresholdMist: gasConfig.coinMergeThresholdMist,
      triggerCount: gasConfig.coinMergeTriggerCount,
      lockedCoinIds: this.coinStore.getLockedCoinIds()
    });
    await this.state.storage.setAlarm(Date.now() + gasConfig.coinMergeIntervalMs);
  }
  async drainQueue() {
    if (this.processing) return;
    this.processing = true;
    while (this.pending.length > 0) {
      const item = this.pending.shift();
      this.metrics.queueDepth = this.pending.length;
      try {
        const response = await this.handleSponsor(item.body);
        item.resolve(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        item.resolve(
          Response.json({ error: "sponsor_failed", message }, { status: 500 })
        );
      }
    }
    this.processing = false;
  }
  async handleSponsor(body) {
    const privKeyHex = this.env.SURVEY_PASS_ISSUER_PRIV;
    if (!privKeyHex) {
      return Response.json({ error: "no_key", message: "Sponsor key not configured" }, { status: 503 });
    }
    const gasConfig = loadGasConfig(this.env);
    const keypair = keypairFromHex(privKeyHex);
    const sponsorAddress = keypair.getPublicKey().toSuiAddress();
    const suiClient = new SuiJsonRpcClient({ url: this.env.SUI_RPC_URL });
    const outcome = await runSponsorPipeline({
      txBytes: body.txBytes,
      senderAddress: body.senderAddress,
      suiClient,
      keypair,
      sponsorAddress,
      coinStore: this.coinStore,
      gasConfig,
      context: body.pipelineContext,
      requestId: body.requestId
    });
    this.metrics.lastOutcome = outcome.metrics.outcome;
    this.metrics.lockedCoinCount = this.coinStore.getLockedCoinIds().size;
    if (!outcome.ok) {
      console.log(
        JSON.stringify({
          event: "gas_sponsor",
          requestId: body.requestId,
          sender: body.senderAddress,
          outcome: outcome.metrics.outcome,
          queueWaitMs: outcome.metrics.queueWaitMs,
          dryRunMs: outcome.metrics.dryRunMs,
          coinObjectId: outcome.metrics.coinObjectId
        })
      );
      return Response.json(
        { error: outcome.error, message: outcome.message },
        { status: outcome.status }
      );
    }
    console.log(
      JSON.stringify({
        event: "gas_sponsor",
        requestId: body.requestId,
        sender: body.senderAddress,
        outcome: "success",
        queueWaitMs: outcome.metrics.queueWaitMs,
        dryRunMs: outcome.metrics.dryRunMs,
        coinObjectId: outcome.metrics.coinObjectId
      })
    );
    return Response.json(outcome.result);
  }
  async health() {
    const privKeyHex = this.env.SURVEY_PASS_ISSUER_PRIV;
    if (!privKeyHex) {
      return { available: false, reason: "no_key", queueDepth: this.metrics.queueDepth };
    }
    const keypair = keypairFromHex(privKeyHex);
    const sponsorAddress = keypair.getPublicKey().toSuiAddress();
    const suiClient = new SuiJsonRpcClient({ url: this.env.SUI_RPC_URL });
    const gasConfig = loadGasConfig(this.env);
    try {
      const coins = await suiClient.getCoins({
        owner: sponsorAddress,
        coinType: "0x2::sui::SUI"
      });
      const locked = this.coinStore.getLockedCoinIds();
      const minBalance = gasConfig.gasBudgetCapMist;
      const unlocked = coins.data.filter(
        (c) => !locked.has(c.coinObjectId) && BigInt(c.balance) >= minBalance
      );
      this.metrics.lockedCoinCount = locked.size;
      this.metrics.unlockedCoinCount = unlocked.length;
      return {
        available: unlocked.length > 0,
        sponsorAddress,
        unlockedCoinCount: unlocked.length,
        lockedCoinCount: locked.size,
        queueDepth: this.metrics.queueDepth,
        lastOutcome: this.metrics.lastOutcome
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { available: false, reason: message, queueDepth: this.metrics.queueDepth };
    }
  }
};
function keypairFromHex(privKeyHex) {
  const privKeyClean = privKeyHex.startsWith("0x") ? privKeyHex.slice(2) : privKeyHex;
  const privateKeyBytes = new Uint8Array(Buffer.from(privKeyClean, "hex"));
  return Ed25519Keypair.fromSecretKey(privateKeyBytes.slice(0, 32));
}
__name(keypairFromHex, "keypairFromHex");

// src/index.ts
function normalizeSponsorId(address) {
  let clean2 = address.toLowerCase();
  if (clean2.startsWith("0x")) clean2 = clean2.slice(2);
  return "0x" + clean2.padStart(64, "0");
}
__name(normalizeSponsorId, "normalizeSponsorId");
var src_default = {
  async fetch(request, env2) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      const privKeyHex = env2.SURVEY_PASS_ISSUER_PRIV;
      if (!privKeyHex) {
        return Response.json({ available: false, reason: "no_key" });
      }
      const { Ed25519Keypair: Ed25519Keypair2 } = await Promise.resolve().then(() => (init_ed255192(), ed25519_exports));
      const privKeyClean = privKeyHex.startsWith("0x") ? privKeyHex.slice(2) : privKeyHex;
      const keypair = Ed25519Keypair2.fromSecretKey(
        new Uint8Array(Buffer.from(privKeyClean, "hex")).slice(0, 32)
      );
      const sponsorAddress = keypair.getPublicKey().toSuiAddress();
      const id = env2.GAS_STATION.idFromName(normalizeSponsorId(sponsorAddress));
      const stub = env2.GAS_STATION.get(id);
      return stub.fetch(new Request("https://gas-station/health", { method: "GET" }));
    }
    if (url.pathname === "/sponsor" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const sponsorAddress = body.sponsorAddress;
      if (!sponsorAddress) {
        return Response.json(
          { error: "missing_sponsor_address", message: "sponsorAddress required for routing" },
          { status: 400 }
        );
      }
      const id = env2.GAS_STATION.idFromName(normalizeSponsorId(sponsorAddress));
      const stub = env2.GAS_STATION.get(id);
      return stub.fetch(
        new Request("https://gas-station/sponsor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        })
      );
    }
    return new Response("Not found", { status: 404 });
  }
};

// ../../node_modules/.pnpm/wrangler@4.98.0_@cloudflare+workers-types@4.20260607.1/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
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

// ../../node_modules/.pnpm/wrangler@4.98.0_@cloudflare+workers-types@4.20260607.1/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
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
    return Response.json(error3, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-wcLhdT/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../node_modules/.pnpm/wrangler@4.98.0_@cloudflare+workers-types@4.20260607.1/node_modules/wrangler/templates/middleware/common.ts
init_modules_watch_stub();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
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

// .wrangler/tmp/bundle-wcLhdT/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
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
  GasStationDO,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
/*! Bundled license information:

@scure/base/lib/esm/index.js:
  (*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/utils.js:
@noble/curves/esm/abstract/modular.js:
@noble/curves/esm/abstract/curve.js:
@noble/curves/esm/abstract/edwards.js:
@noble/curves/esm/ed25519.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@scure/bip39/esm/index.js:
  (*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) *)
*/
//# sourceMappingURL=index.js.map
