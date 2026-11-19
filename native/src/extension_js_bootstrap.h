#pragma once
namespace moon::extension {
inline constexpr const char* jsNativePrelude=R"MOONJS((() => {
  const events = new Map(), timers = new Map(); let sequence = 0;
  let now = 0;
  Object.defineProperty(globalThis, 'window', {value: globalThis});
  globalThis.addEventListener = (name, listener) => { if (typeof listener !== 'function') return; let set = events.get(name); if (!set) events.set(name, set = new Set()); set.add(listener); };
  globalThis.removeEventListener = (name, listener) => events.get(name)?.delete(listener);
  globalThis.dispatchEvent = event => { for (const callback of events.get(event.type) || []) callback(event); return true; };
  globalThis.CustomEvent = class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } };
  globalThis.Event = class { constructor(type) { this.type = type; } };
  globalThis.console = Object.freeze(Object.fromEntries(['log','info','warn','error','debug'].map(level => [level, (...args) => __moonPost(JSON.stringify({type:'native-console',level,message:args.map(String).join(' ')}))])));
  const schedule = (callback, delay, interval, args) => { if (typeof callback !== 'function') throw new TypeError('Native timers require a function'); if (timers.size >= 4096) throw new Error('Too many extension timers'); const id = ++sequence; delay = Math.max(0, Number(delay) || 0); timers.set(id, {callback, due:now+delay, interval:interval?Math.max(1,delay):0,args}); return id; };
  globalThis.setTimeout = (callback, delay, ...args) => schedule(callback,delay,false,args);
  globalThis.setInterval = (callback, delay, ...args) => schedule(callback,delay,true,args);
  globalThis.clearTimeout = globalThis.clearInterval = id => timers.delete(id);
  Object.defineProperty(globalThis,'__moonTick',{value:time => {now=time; const due=[...timers].filter(([,timer])=>timer.due<=now);for(const [id,timer] of due){if(!timers.has(id))continue;if(timer.interval)timer.due=now+timer.interval;else timers.delete(id);try{timer.callback(...timer.args);}catch(error){console.error(error);}}}});
  Object.defineProperty(globalThis,'parent',{value:Object.freeze({postMessage:message => {let encoded;if(message?.type==='moonsprite-extension-request'&&message.method==='storage.set')encoded=JSON.stringify(message.params?.value);__moonPost(JSON.stringify({message,encoded}));}})});
  Object.defineProperty(globalThis,'__moonReceive',{value:data => dispatchEvent({type:'message',data})});
})();
)MOONJS";
// Exact legacy ExtensionRuntimeHost.tsx runtimeBootstrap.
inline constexpr const char* jsRuntimeBootstrap=R"MOONJS((() => {
  const pending = new Map();
  const listeners = new Map();
  let sequence = 0;
  const call = (method, params) => new Promise((resolve, reject) => {
    if (pending.size >= 256) { reject(new Error('Too many pending extension requests')); return; }
    const requestId = String(++sequence);
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Extension request timed out')); }, 300000);
    pending.set(requestId, { resolve, reject, timer });
    try { parent.postMessage({ type: 'moonsprite-extension-request', requestId, method, params }, '*'); }
    catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error); }
  });
  const on = (type, listener) => {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    const values = listeners.get(type) || new Set(); values.add(listener); listeners.set(type, values);
    return () => values.delete(listener);
  };
  const domain = (name, methods) => Object.freeze(Object.fromEntries(methods.map(method => [method, (params) => call(name + '.' + method, params)])));
  const api = Object.freeze({
    apiVersion: '1.0.0', call, on,
    runtime: domain('runtime', ['getCapabilities', 'getLocale', 'setFileDropTypes']), commands: domain('commands', ['execute']), menus: domain('menus', ['setItems']),
    ui: domain('ui', ['notify', 'openSettings']), windows: domain('windows', ['open', 'close', 'postMessage', 'setVisible']), workspace: domain('workspace', ['listProjects', 'getActiveProject', 'activateProject']),
    document: domain('document', ['getSummary', 'getLayers', 'getFrames', 'undo', 'redo']),
    tools: domain('tools', ['getActive', 'setActive']), colors: domain('colors', ['get', 'setPrimary', 'setSecondary']),
    storage: domain('storage', ['get', 'set', 'remove', 'list']), resources: domain('resources', ['read']),
    clipboard: domain('clipboard', ['readText', 'writeText']), notifications: domain('notifications', ['show']),
    network: domain('network', ['fetch']), diagnostics: domain('diagnostics', ['log'])
  });
  Object.defineProperty(window, 'moonsprite', { value: api, configurable: false, writable: false });
  addEventListener('message', event => {
    const message = event.data;
    if (message?.type === 'moonsprite-extension-response') {
      const request = pending.get(message.requestId); if (!request) return; pending.delete(message.requestId); clearTimeout(request.timer);
      message.ok ? request.resolve(message.result) : request.reject(new Error(message.error || 'Extension request failed'));
      return;
    }
    if (message?.type !== 'moonsprite-extension-event') return;
    for (const listener of listeners.get(message.event?.type) || []) {
      Promise.resolve().then(() => listener(message.event)).catch(error => {
        console.error(error);
        call('ui.notify', { message: String(error), level: 'error' }).catch(console.error);
      });
    }
    dispatchEvent(new CustomEvent('moonsprite:' + message.event?.type, { detail: message.event }));
  });
})();)MOONJS";
}
