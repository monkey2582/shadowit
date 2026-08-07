/**
 * shadowit - Shadow DOM 控制库 v2.0.0
 * TypeScript 类型定义
 * 微响应式、模板预编译引擎、事件委托白名单
 * https://github.com/monkey2582/shadowit
 */

// ============================================================
// setup() 返回值（扁平对象：函数 → methods，非函数 → data，computed 特殊）
// ============================================================
/**
 * setup() 返回一个扁平对象，系统自动拆分：
 * - 键为 'computed' 且值为对象 → 计算属性
 * - 值为函数的键 → 方法（供事件委托查找）
 * - 值为非函数的键 → 数据
 *
 * @example
 * setup: () => ({
 *   count: 0,              // → data
 *   name: 'world',         // → data
 *   inc() { this.count++ },// → methods
 *   computed: {            // → computed
 *     doubleCount: (data) => data.count * 2
 *   }
 * })
 */

// ============================================================
// ShadowIt 实例选项
// ============================================================
export interface ShadowItOptions {
  /** HTML 模板字符串，或返回模板字符串的函数（为空时自动取宿主子元素作为模板） */
  template?: string | ((data: Record<string, any>) => string);
  /** CSS 样式字符串，或返回样式字符串的函数 */
  css?: string | ((data: Record<string, any>) => string);
  /** CSS 样式字符串（css 别名） */
  styles?: string | ((data: Record<string, any>) => string);
  /**
   * 宿主元素选择器/元素/数组
   * 支持字符串选择器、Element、NodeList、数组（可混合）
   * @example el: '#app'
   * @example el: ['.a', document.querySelectorAll('.b'), '.c']
   */
  el?: string | Element | Array<string | Element | NodeList> | NodeList;
  /**
   * 统一初始化函数，返回扁平对象（数据和方法混写）
   * @example setup: () => ({ count: 0, inc() { this.count++ } })
   */
  setup?: () => Record<string, any>;
  /** Shadow Root 模式：'open'（默认）或 'closed' */
  mode?: 'open' | 'closed';
  /** ShadowRoot.delegatesFocus — 是否将焦点委托给第一个可聚焦子元素 */
  delegatesFocus?: boolean;
  /** ShadowRoot.clonable — 克隆宿主时是否克隆 ShadowRoot */
  clonable?: boolean;
  /** ShadowRoot.serializable — 是否允许通过 getHTML() 等方法序列化 */
  serializable?: boolean;
  /** ShadowRoot.slotAssignment — 'named'（默认）或 'manual' */
  slotAssignment?: 'named' | 'manual';
  /** ShadowRoot.customElementRegistry — 自定义元素的 CustomElementRegistry 实例 */
  customElementRegistry?: CustomElementRegistry;
  /** 全局错误回调 */
  onError?: ((err: Error, context: string) => void) | null;
  /** 事件是否绑定在宿主元素上（默认在 Shadow Root 上） */
  eventsOnHost?: boolean;
  /** 实例名称（用于 shadowit.instance.name 访问） */
  name?: string | null;

  // ===== 生命周期钩子（顶层选项） =====

  /** 首次渲染前调用（this 指向 ShadowIt 实例） */
  beforeRender?: ((this: ShadowItInstance, element: HTMLElement, instance: ShadowItInstance) => void) | null;
  /** 首次渲染后调用，参数为当前数据对象（this 指向 ShadowIt 实例） */
  afterRender?: ((this: ShadowItInstance, data: Record<string, any>, element: HTMLElement, instance: ShadowItInstance) => void) | null;
  /**
   * 每次更新前调用（数据合并前）
   * @param newData 本次更新的增量数据
   * @param oldData 更新前的数据快照（深拷贝）
   * @param element 宿主元素 DOM 节点
   * @param instance ShadowIt 实例
   */
  beforeUpdate?: ((this: ShadowItInstance, newData?: Record<string, any>, oldData?: Record<string, any> | null, element?: HTMLElement, instance?: ShadowItInstance) => void) | null;
  /**
   * 每次更新后调用
   * @param newData 本次更新的增量数据
   * @param currentData 更新后的当前数据
   * @param element 宿主元素 DOM 节点
   * @param instance ShadowIt 实例
   */
  afterUpdate?: ((this: ShadowItInstance, newData?: Record<string, any>, currentData?: Record<string, any>, element?: HTMLElement, instance?: ShadowItInstance) => void) | null;
  /**
   * 渲染前判断钩子
   * 在数据合并后调用，此时 this._data 已是最新状态。
   * 返回 false 可跳过本次渲染（数据已合并，仅跳过 DOM 更新）。
   * @param newData 本次更新的增量数据
   * @param mergedData 合并后的最终数据
   * @param element 宿主元素 DOM 节点
   * @param instance ShadowIt 实例
   * @returns 是否继续渲染
   */
  shouldUpdate?: ((this: ShadowItInstance, newData?: Record<string, any>, mergedData?: Record<string, any>, element?: HTMLElement, instance?: ShadowItInstance) => boolean) | null;
  /** 实例销毁时调用（this 指向 ShadowIt 实例） */
  destroy?: ((this: ShadowItInstance, element: HTMLElement, instance: ShadowItInstance) => void) | null;
}

// ============================================================
// ShadowIt 实例
// ============================================================
export interface ShadowItInstance {
  /**
   * 挂载到宿主元素（构造函数中已自动调用）
   * 支持单个宿主、数组（含混合类型：选择器字符串、Element、NodeList）
   * 重复挂载会先 detach 旧宿主
   * @example mount('#app')
   * @example mount(['.a', document.querySelectorAll('.b'), '.c'])
   */
  mount(host: string | Element | Array<string | Element | NodeList> | NodeList): this;

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

  /**
   * 更新视图，可选传入增量数据
   * 事件处理后自动触发更新（微响应式）
   */
  update(newData?: Record<string, any> | null): this;

  /**
   * 事件委托绑定
   * @param event 事件类型，如 'click'
   * @param selector CSS 选择器
   * @param handler 事件处理函数
   */
  on(event: string, selector: string, handler: (e: Event, el: Element) => void): this;

  /**
   * 事件委托解绑
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

  /** 缓存版 querySelector（自动 isConnected 失效，仅结构性 DOM 变化时清除缓存） */
  qS(selector: string, root?: Element | Document | string): Element | null;

  /** 缓存版 querySelectorAll（自动 isConnected 失效，仅结构性 DOM 变化时清除缓存） */
  qSAll(selector: string, root?: Element | Document | string): Element[];

  /** 获取 Shadow Root 内部 HTML */
  getHTML(): string;

  /** 获取 Shadow DOM 内嵌套的 Shadow DOM 宿主元素列表 */
  getShadowDOM(): Element[];

  /** 获取实例名称 */
  getName(): string | null;

  /** 获取实例 ID */
  getId(): string;

  /**
   * 获取多宿主组中的所有实例
   * 当通过 sdit([...]) 或 mount([...]) 创建多宿主时，返回包含所有实例的数组
   */
  getGroupInstances(): ShadowItInstance[];

  /** 卸载实例（与 mount 相反，保留数据和配置，可重新挂载） */
  unmount(): this;

  /** 销毁实例 */
  destroy(): this;
}

// ============================================================
// shadowit.define() 选项
// ============================================================
export interface ShadowItDefineOptions {
  /** HTML 模板字符串 */
  template: string;
  /** CSS 样式字符串，或返回样式字符串的函数 */
  css?: string | ((data: Record<string, any>) => string);
  /** CSS 样式字符串（css 别名） */
  styles?: string | ((data: Record<string, any>) => string);
  /**
   * 统一初始化函数，返回扁平对象（数据和方法混写）
   */
  setup?: () => Record<string, any>;
  /** Shadow Root 模式：'open'（默认）或 'closed' */
  mode?: 'open' | 'closed';
  /** ShadowRoot.delegatesFocus — 是否将焦点委托给第一个可聚焦子元素 */
  delegatesFocus?: boolean;
  /** ShadowRoot.clonable — 克隆宿主时是否克隆 ShadowRoot */
  clonable?: boolean;
  /** ShadowRoot.serializable — 是否允许序列化 */
  serializable?: boolean;
  /** ShadowRoot.slotAssignment — 'named'（默认）或 'manual' */
  slotAssignment?: 'named' | 'manual';
  /** ShadowRoot.customElementRegistry — 自定义元素的 CustomElementRegistry 实例 */
  customElementRegistry?: CustomElementRegistry;
  /** 需要监听的 HTML 属性列表 */
  observedAttributes?: string[];
  /**
   * 属性变化回调（宏任务执行，未设置时自动更新到 data）
   * @param attrName 属性名
   * @param oldVal 旧值
   * @param newVal 新值
   * @param element 自定义元素 DOM 节点
   * @param instance ShadowIt 实例
   */
  attributeChanged?: ((this: ShadowItInstance, attrName: string, oldVal: string | null, newVal: string | null, element: HTMLElement, instance: ShadowItInstance) => void) | null;
  /** 元素连接到 DOM 时的回调（this 指向 ShadowIt 实例） */
  connected?: ((this: ShadowItInstance) => void) | null;
  /** 元素从 DOM 断开时的回调（this 指向 ShadowIt 实例，实例已销毁） */
  disconnected?: ((this: ShadowItInstance) => void) | null;
  /** 实例名称 */
  name?: string | null;
  /** 全局错误回调 */
  onError?: ((err: Error, context: string) => void) | null;
  /** 事件是否绑定在宿主元素上 */
  eventsOnHost?: boolean;

  // ===== 生命周期钩子（顶层选项） =====

  /** 首次渲染前调用（this 指向 ShadowIt 实例） */
  beforeRender?: ((this: ShadowItInstance, element: HTMLElement, instance: ShadowItInstance) => void) | null;
  /** 首次渲染后调用（this 指向 ShadowIt 实例） */
  afterRender?: ((this: ShadowItInstance, data: Record<string, any>, element: HTMLElement, instance: ShadowItInstance) => void) | null;
  /** 每次更新前调用（this 指向 ShadowIt 实例） */
  beforeUpdate?: ((this: ShadowItInstance, newData?: Record<string, any>, oldData?: Record<string, any> | null, element?: HTMLElement, instance?: ShadowItInstance) => void) | null;
  /** 每次更新后调用（this 指向 ShadowIt 实例） */
  afterUpdate?: ((this: ShadowItInstance, newData?: Record<string, any>, currentData?: Record<string, any>, element?: HTMLElement, instance?: ShadowItInstance) => void) | null;
  /** 渲染前判断钩子，返回 false 跳过渲染（this 指向 ShadowIt 实例） */
  shouldUpdate?: ((this: ShadowItInstance, newData?: Record<string, any>, mergedData?: Record<string, any>, element?: HTMLElement, instance?: ShadowItInstance) => boolean) | null;
  /** 实例销毁时调用（this 指向 ShadowIt 实例） */
  destroy?: ((this: ShadowItInstance, element: HTMLElement, instance: ShadowItInstance) => void) | null;
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
// 全局 shadowit 函数
// ============================================================

/**
 * 创建 ShadowIt 实例
 *
 * @example
 * // 纯选项对象（可含 el 指定宿主）
 * sdit({ el: '#app', template: '<div>{{name}}</div>', css: 'div { color: red; }' })
 *
 * // 完整配置
 * shadowit(hostEl, { template: '<div>{{name}}</div>', css: 'div { color: red; }' })
 *
 * // 简写：template + css
 * shadowit('<div>{{name}}</div>', 'div { color: red; }')
 *
 * // 数组多宿主（自动 template 取首个宿主子元素，返回首个实例，可链式 .mount()）
 * shadowit(['.a', document.querySelectorAll('.b'), '.c'])
 *   .mount(['.d'])
 */
export interface ShadowItFunction {
  (host: string | Element | Array<string | Element | NodeList> | NodeList, options?: ShadowItOptions): ShadowItInstance;
  (options: ShadowItOptions): ShadowItInstance;
  (template: string, css: string, host?: string | Element): ShadowItInstance;

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
    _evalExpr(expr: string, data: Record<string, any>): any;
    parseTemplate(template: string, data: Record<string, any>, onceCache?: Record<string, string>, pendingPromises?: Array<{ promise: Promise<any>; thenTokens: any[]; thenVar: string | null; catchTokens: any[]; catchVar: string | null; finallyTokens: any[] }>, methods?: Record<string, Function>): string;
    renderTemplate(template: string, data: Record<string, any>, onceCache?: Record<string, string>, pendingPromises?: Array<{ promise: Promise<any>; thenTokens: any[]; thenVar: string | null; catchTokens: any[]; catchVar: string | null; finallyTokens: any[] }>, methods?: Record<string, Function>): string;
    parseEventExpr(expr: string): { name: string; args: any[] };
    _tokenize(template: string): Array<{ type: string; value?: string; name?: string; arg?: string; cond?: string | null }>;
    _processTokens(tokens: any[], startIdx: number, data: Record<string, any>, onceCache: Record<string, string>, pendingPromises: any[] | null, methods?: Record<string, Function>): string;
    _findClosingBraces(template: string, startPos: number): number;
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
   *   setup: () => ({ count: 0, inc() { this.count++ }, computed: { doubleCount: (data) => data.count * 2 } }),
 *   observedAttributes: ['count'],
   *   afterRender(data) { console.log('rendered', data); }
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
}