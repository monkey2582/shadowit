/**
 * shadowit - Shadow DOM 控制库 v1.4.0
 * TypeScript 类型定义
 * https://github.com/monkey2582/shadowit
 */

// ============================================================
// 生命周期钩子
// ============================================================
export interface LifecycleHooks {
  /** 首次渲染前调用 */
  beforeRender?: (() => void) | null;
  /** 首次渲染后调用，参数为当前数据对象 */
  afterRender?: ((data: Record<string, any>) => void) | null;
  /**
   * 每次更新前调用（数据合并前）
   * @param newData 本次更新的增量数据
   * @param oldData 更新前的数据快照（深拷贝）
   */
  beforeUpdate?: ((newData?: Record<string, any>, oldData?: Record<string, any> | null) => void) | null;
  /**
   * 每次更新后调用
   * @param newData 本次更新的增量数据
   * @param currentData 更新后的当前数据
   */
  afterUpdate?: ((newData?: Record<string, any>, currentData?: Record<string, any>) => void) | null;
  /**
   * 渲染前判断钩子（v1.2.0 新增，v1.3.0 调至数据合并后调用）
   * 在数据合并后调用，此时 this._data 已是最新状态。
   * 返回 false 可跳过本次渲染（数据已合并，仅跳过 DOM 更新）。
   * @param newData 本次更新的增量数据
   * @param mergedData 合并后的最终数据
   * @returns 是否继续渲染
   */
  shouldUpdate?: ((newData?: Record<string, any>, mergedData?: Record<string, any>) => boolean) | null;
  /** 实例销毁时调用 */
  destroy?: (() => void) | null;
}

// ============================================================
// ShadowIt 实例选项
// ============================================================
export interface ShadowItOptions {
  /** HTML 模板字符串，或返回模板字符串的函数 */
  template?: string | ((data: Record<string, any>) => string);
  /** CSS 样式字符串，或返回样式字符串的函数（v1.2.0 新增函数支持） */
  css?: string | ((data: Record<string, any>) => string);
  /** CSS 样式字符串（css 别名） */
  styles?: string | ((data: Record<string, any>) => string);
  /** 初始数据对象 */
  data?: Record<string, any>;
  /** Shadow Root 模式：'open'（默认）或 'closed' */
  mode?: 'open' | 'closed';
  /** 生命周期钩子 */
  lifecycle?: LifecycleHooks;
  /** 全局错误回调 */
  onError?: ((err: Error, context: string) => void) | null;
  /** 事件是否绑定在宿主元素上（默认在 Shadow Root 上） */
  eventsOnHost?: boolean;
  /** 实例名称（用于 shadowit.instance.name 访问） */
  name?: string | null;
  /** 外部方法映射（供事件委托查找） */
  methods?: Record<string, (...args: any[]) => any>;
  /**
   * 计算属性（v1.4.0 新增）
   * 每次渲染前计算，结果写入 data 中供模板使用。
   * @example computed: { fullName: (data) => data.first + ' ' + data.last }
   */
  computed?: Record<string, (data: Record<string, any>) => any>;
  /**
   * 是否启用 Proxy 响应式自动更新（v1.4.0 新增，默认 true）
   * 开启后，直接修改 instance.data 属性会自动触发更新，无需手动调用 update()。
   * 注意：仅支持顶层属性修改，嵌套路径请使用 update()。
   * @default true
   */
  reactive?: boolean;
}

// ============================================================
// ShadowIt 实例
// ============================================================
export interface ShadowItInstance {
  /** 挂载到宿主元素（构造函数中已自动调用） */
  mount(host: string | Element): this;

  /** 设置模板 */
  template(html: string | ((data: Record<string, any>) => string)): this;

  /** 设置 CSS 样式 */
  css(cssStr: string | ((data: Record<string, any>) => string)): this;

  /** 设置 CSS 样式（css 别名） */
  styles(cssStr: string | ((data: Record<string, any>) => string)): this;

  /** 合并更新数据（浅合并） */
  data(newData: Record<string, any>): this;

  /** 全量替换数据 */
  setData(newData: Record<string, any>): this;

  /** 获取当前数据的深拷贝 */
  getData(): Record<string, any>;

  /** 渲染（首次使用，等同 update(null)） */
  render(): this;

  /** 更新视图，可选传入增量数据 */
  update(newData?: Record<string, any> | null): this;

  /**
   * 事件委托绑定
   * @param event 事件类型，如 'click'
   * @param selector CSS 选择器
   * @param handler 事件处理函数
   */
  on(event: string, selector: string, handler: (e: Event, el: Element) => void): this;

  /**
   * 事件委托解绑（v1.2.0 支持精确卸载）
   * @param event 事件类型
   * @param selector 可选，CSS 选择器，传入则精确匹配
   * @param handler 可选，处理函数引用，传入则精确匹配
   * @example off('click') — 移除所有 click 委托
   * @example off('click', '.btn') — 仅移除 .btn 的 click
   * @example off('click', '.btn', myHandler) — 精确移除
   */
  off(event: string, selector?: string, handler?: (e: Event, el: Element) => void): this;

  /** 获取 Shadow Root */
  getRoot(): ShadowRoot | null;

  /** 获取宿主元素 */
  getHost(): Element | null;

  /** 是否已渲染 */
  isRendered(): boolean;

  /** 是否已销毁 */
  isDestroyed(): boolean;

  /** 是否已挂载 */
  isMounted(): boolean;

  /** 在 Shadow Root 内查询单个元素 */
  querySelector(selector: string, root?: Element | Document | string): Element | null;

  /** 在 Shadow Root 内查询多个元素 */
  querySelectorAll(selector: string, root?: Element | Document | string): Element[];

  /** 缓存版 querySelector（自动 isConnected 失效） */
  qS(selector: string, root?: Element | Document | string): Element | null;

  /** 缓存版 querySelectorAll（自动 isConnected 失效） */
  qSAll(selector: string, root?: Element | Document | string): Element[];

  /** 获取 Shadow Root 内部 HTML */
  getHTML(): string;

  /** 获取 Shadow DOM 内嵌套的 Shadow DOM 宿主元素列表 */
  getShadowDOM(): Element[];

  /** 获取实例名称 */
  getName(): string | null;

  /** 获取实例 ID */
  getId(): string;

  /** 销毁实例 */
  destroy(): this;
}

// ============================================================
// shadowit.define() 选项
// ============================================================
export interface ShadowItDefineOptions {
  /** HTML 模板字符串 */
  template: string;
  /** CSS 样式字符串，或返回样式字符串的函数（v1.2.0 新增函数支持） */
  css?: string | ((data: Record<string, any>) => string);
  /** CSS 样式字符串（css 别名） */
  styles?: string | ((data: Record<string, any>) => string);
  /** 初始数据 */
  data?: Record<string, any>;
  /** Shadow Root 模式：'open'（默认）或 'closed' */
  mode?: 'open' | 'closed';
  /** 生命周期钩子 */
  lifecycle?: LifecycleHooks;
  /** 需要监听的 HTML 属性列表 */
  observedAttributes?: string[];
  /** 属性变化回调（未设置时自动更新到 data） */
  attributeChanged?: ((attrName: string, oldVal: string | null, newVal: string | null) => void) | null;
  /** 元素连接到 DOM 时的回调 */
  connected?: (() => void) | null;
  /** 元素从 DOM 断开时的回调 */
  disconnected?: (() => void) | null;
  /** 实例名称 */
  name?: string | null;
  /** 全局错误回调 */
  onError?: ((err: Error, context: string) => void) | null;
  /** 事件是否绑定在宿主元素上 */
  eventsOnHost?: boolean;
  /**
   * 计算属性（v1.4.0 新增）
   * @example computed: { fullName: (data) => data.first + ' ' + data.last }
   */
  computed?: Record<string, (data: Record<string, any>) => any>;
  /**
   * 是否启用 Proxy 响应式（v1.4.0 新增，默认 true）
   */
  reactive?: boolean;
}

// ============================================================
// shadowit.define() 返回值
// ============================================================
export interface ShadowItDefineResult {
  /** 注册的标签名 */
  _tagName: string;
  /** 自定义元素类 */
  _elementClass: typeof HTMLElement;
  /** 获取所有该标签的实例 */
  _getInstances(): ShadowItInstance[];
  /** 销毁所有该标签的实例 */
  destroy(): void;
  /** 在所有实例上绑定事件 */
  on(event: string, selector: string, handler: (e: Event, el: Element) => void): this;
  /** 在所有实例上解绑事件 */
  off(event: string, selector: string, handler?: (e: Event, el: Element) => void): this;
  /** 在所有实例上合并数据 */
  data(newData: Record<string, any>): this;
  /** 在所有实例上设置模板并重新渲染 */
  template(tpl: string): this;
  /** 在所有实例上设置 CSS */
  css(cssStr: string | ((data: Record<string, any>) => string)): this;
}

// ============================================================
// shadowit.copy() 返回值
// ============================================================
export interface ShadowItCopyClipboard {
  /** 包装后的元素 */
  el: HTMLDivElement;
  /** 粘贴到目标元素 */
  paste(dest: string | Element): this;
}

// ============================================================
// DevTools 调试钩子（v1.4.0 新增）
// ============================================================
export interface ShadowItDevTools {
  /** 版本号 */
  version: string;
  /** 获取所有活跃实例 */
  getAll(): ShadowItInstance[];
  /** 按名称获取实例 */
  get(name: string): ShadowItInstance | null;
  /** 按宿主选择器获取实例 */
  getByHost(selector: string): ShadowItInstance | null;
  /** 列出所有实例摘要 */
  list(): Array<{
    index: number;
    name: string | null;
    id: string;
    host: string;
    rendered: boolean;
    mounted: boolean;
    destroyed: boolean;
    data: Record<string, any>;
  }>;
}

// ============================================================
// 全局 shadowit 函数
// ============================================================

/**
 * 创建 ShadowIt 实例
 *
 * @example
 * // 完整配置
 * shadowit(hostEl, { template: '<div>{{name}}</div>', css: 'div { color: red; }' })
 *
 * // 简写：template + css
 * shadowit('<div>{{name}}</div>', 'div { color: red; }')
 *
 * // 简写：template + css + 宿主选择器
 * shadowit('<div>{{name}}</div>', 'div { color: red; }', '#app')
 */
export interface ShadowItFunction {
  (host: string | Element, options: ShadowItOptions): ShadowItInstance;
  (template: string, css: string, host?: string | Element): ShadowItInstance;
  (options: ShadowItOptions): ShadowItInstance;

  /** 版本号 */
  version: string;

  /** ShadowIt 构造函数 */
  ShadowIt: new (host?: string | Element | null, options?: ShadowItOptions) => ShadowItInstance;

  /** 工具函数集 */
  utils: {
    isObject(v: any): boolean;
    isFunction(v: any): boolean;
    isString(v: any): boolean;
    isArray(v: any): boolean;
    deepClone<T>(obj: T): T;
    merge<T extends Record<string, any>>(target: T, source: Partial<T>): T;
    getNested(obj: any, path: string): any;
    uid(): string;
    isCSS(str: any): boolean;
    resolveRoot(root?: any): Element | Document;
    resolveHost(host?: any): Element | null;
    stripComments(template: string): string;
    escapeHtml(str: any): string;
    evalCondition(expr: string, data: Record<string, any>): boolean;
    parseTemplate(template: string, data: Record<string, any>, onceCache?: Record<string, string>, pendingPromises?: Array<{ promise: Promise<any>; thenContent: string; thenVar: string | null; catchContent: string; catchVar: string | null }>): string;
    renderTemplate(template: string, data: Record<string, any>, onceCache?: Record<string, string>, pendingPromises?: Array<{ promise: Promise<any>; thenContent: string; thenVar: string | null; catchContent: string; catchVar: string | null }>): string;
    parseEventExpr(expr: string): { name: string; args: any[] };
    _setNested(obj: any, path: string, value: any): void;
    _splitAwaitBranches(content: string): { loading: string; then: string; thenVar: string | null; catch: string; catchVar: string | null };
  };

  /** 浏览器是否支持 Shadow DOM */
  isSupported: boolean;

  /** 通过名称获取实例 */
  getInstance(name: string): ShadowItInstance | null;

  /** 注销名称注册的实例 */
  unregisterInstance(name: string): ShadowItFunction;

  /** 通过宿主元素获取实例 */
  getInstanceByHost(host: Element): ShadowItInstance | null;

  /**
   * 命名实例代理访问
   * @example shadowit.instance.myApp.update({ name: 'new' })
   */
  instance: Record<string, ShadowItInstance>;

  /**
   * 穿透 Shadow DOM 查询单个元素
   * （仅穿透 mode='open' 的 Shadow Root）
   */
  querySelector(selector: string, root?: Element | Document | string): Element | null;

  /**
   * 穿透 Shadow DOM 查询多个元素
   * （仅穿透 mode='open' 的 Shadow Root）
   */
  querySelectorAll(selector: string, root?: Element | Document | string): Element[];

  /** 启用/禁用全局查询缓存 */
  enableQueryCache(enable: boolean): ShadowItFunction;

  /** 清空全局查询缓存 */
  clearQueryCache(): ShadowItFunction;

  /**
   * 批量更新（合并到同一帧执行，自动去重）
   * @example shadowit.batchUpdate(inst, { count: inst.getData().count + 1 })
   */
  batchUpdate(instance: ShadowItInstance, data: Record<string, any>): ShadowItFunction;

  /** 通过名称移除实例 */
  remove(name: string, root?: Element | Document | string): ShadowItFunction;

  /** 移除指定根节点下的所有实例 */
  removeAll(root?: Element | Document | string): ShadowItFunction;

  /** 扫描并注册已存在的 Shadow DOM */
  scan(root?: Element | Document | string): ShadowItFunction;

  /** 复制元素及其 Shadow DOM */
  copy(source: string | Element, target?: string | Element): ShadowItCopyClipboard;

  /**
   * 接管模式开关
   * 开启后自动拦截 attachShadow 调用，注册实例
   */
  takeOver: boolean;

  /**
   * 注册自定义元素
   *
   * @example
   * // 简写
   * shadowit.define('my-counter', '<div>Count: {{count}}</div>', 'div { font-weight: bold; }')
   *
   * // 完整配置
   * shadowit.define('my-counter', {
   *   template: '<div>Count: {{count}}</div>',
   *   css: 'div { font-weight: bold; }',
   *   mode: 'open',
   *   data: { count: 0 },
   *   computed: { doubleCount: (data) => data.count * 2 },
   *   observedAttributes: ['count'],
   *   lifecycle: { afterRender(data) { console.log('rendered', data); } }
   * })
   */
  define(tagName: string, template: string, css?: string): ShadowItDefineResult;
  define(tagName: string, options: ShadowItDefineOptions): ShadowItDefineResult;

  /** 自身引用（别名） */
  sdit: ShadowItFunction;
  /** 自身引用（别名） */
  shadowIt: ShadowItFunction;
}

declare const shadowit: ShadowItFunction;
export default shadowit;

// 全局暴露
declare global {
  const shadowit: ShadowItFunction;
  const sdit: ShadowItFunction;
  const ShadowIt: new (host?: string | Element | null, options?: ShadowItOptions) => ShadowItInstance;
  const shadowIt: ShadowItFunction;

  /** DevTools 调试钩子（v1.4.0 新增） */
  const __SHADOWIT_DEVTOOLS__: ShadowItDevTools;

  /**
   * 快捷调试函数（v1.4.0 新增）
   * $s('myComponent') — 获取实例
   * $s() — 列出所有实例
   */
  function $s(name?: string): ShadowItInstance | null | Array<{
    index: number;
    name: string | null;
    id: string;
    host: string;
    rendered: boolean;
    mounted: boolean;
    destroyed: boolean;
    data: Record<string, any>;
  }>;
}