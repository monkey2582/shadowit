/**
 * shadowit - Shadow DOM 控制库 v0.12.0
 * 支持 #for of 语法、#else/#else-if 分支、{{--注释--}}、
 * {{#show}} 条件显示、{{#once}} 一次性渲染、@事件 模板内绑定、
 * 嵌套模板解析、缓存自动失效、批处理更新、延迟挂载、
 * 无模板自动包裹、MutationObserver 自动挂载、
 * copy/paste 复制粘贴、scan 扫描挂载、remove/removeAll 清除、
 * 接管原生 ShadowDOM、qS/qSAll 带缓存查询
 * https://github.com/monkey2582/shadowit
 * @version 0.12.0
 */
(function (global, factory) {
    if (typeof module === 'object' && typeof module.exports === 'object') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define(factory);
    } else {
        global.shadowit = factory();
        global.sdit = global.shadowit;
        global.ShadowIt = global.shadowit.ShadowIt;
        global.shadowIt = global.shadowit;
    }
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    // ============================================================
    // 环境检测
    // ============================================================
    const isSupported = () => {
        return !!(document.createElement('div').attachShadow && window.customElements);
    };

    // ============================================================
    // 工具函数
    // ============================================================
    const utils = {
        isObject(val) { return val !== null && typeof val === 'object' && !Array.isArray(val); },
        isFunction(val) { return typeof val === 'function'; },
        isString(val) { return typeof val === 'string'; },
        isArray(val) { return Array.isArray(val); },

        deepClone(obj) {
            if (!utils.isObject(obj) && !utils.isArray(obj)) return obj;
            const copy = utils.isArray(obj) ? [] : {};
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    copy[key] = utils.isObject(obj[key]) || utils.isArray(obj[key]) ?
                        utils.deepClone(obj[key]) :
                        obj[key];
                }
            }
            return copy;
        },

        merge(target, source) {
            if (!utils.isObject(target) || !utils.isObject(source)) return target;
            for (const key in source) {
                if (Object.prototype.hasOwnProperty.call(source, key)) {
                    target[key] = source[key];
                }
            }
            return target;
        },

        getNested(obj, path) {
            if (!obj || !path) return undefined;
            const keys = path.split('.');
            let result = obj;
            for (const key of keys) {
                if (result === undefined || result === null) return undefined;
                result = result[key];
            }
            return result;
        },

        uid() {
            return 'si-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8);
        },

        // 判断字符串是否为 CSS 代码（包含 { ; 或换行）
        isCSS(str) {
            if (!utils.isString(str)) return false;
            return /[{};]|\n/.test(str);
        },

        // 判断是否为有效选择器（能匹配到元素）
        isSelector(str) {
            if (!utils.isString(str)) return false;
            try {
                return !!document.querySelector(str);
            } catch (e) {
                return false;
            }
        },

        // 解析 Root 参数：不是 selector 或 element 就默认 document.documentElement
        resolveRoot(root) {
            if (!root) return document.documentElement;
            if (root instanceof Element || root === document || root instanceof DocumentFragment) return root;
            if (root.nodeType === 11) return root; // ShadowRoot
            if (utils.isString(root)) {
                try {
                    const el = document.querySelector(root);
                    if (el) return el;
                } catch (e) { /* ignore */ }
            }
            return document.documentElement;
        },

        // 解析宿主元素
        resolveHost(host) {
            if (!host) return null;
            if (host instanceof Element) return host;
            if (utils.isString(host)) {
                try {
                    return document.querySelector(host);
                } catch (e) {
                    return null;
                }
            }
            return null;
        },

        // 去除 {{-- 注释 --}}
        stripComments(template) {
            if (!template) return '';
            return template.replace(/\{\{--[\s\S]*?--\}\}/g, '');
        },

        // 安全插值
        interpolate(template, data) {
            if (!template) return '';
            template = utils.stripComments(template);
            return template.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
                const trimmed = expr.trim();
                if (/^[a-zA-Z_$][\w.$]*$/.test(trimmed)) {
                    const value = utils.getNested(data, trimmed);
                    return value !== undefined && value !== null ? String(value) : '';
                }
                return '';
            });
        },

        // 安全逻辑求值 (#if)
        safeEvalIf(expr, data) {
            const sanitized = expr.replace(/[^a-zA-Z0-9_.$&|!()\s]/g, '');
            const pathRegex = /[a-zA-Z_$][\w.$]*/g;
            const tokens = sanitized.match(pathRegex) || [];
            const values = {};
            tokens.forEach(token => {
                if (!/^(true|false|null|undefined)$/.test(token)) {
                    values[token] = utils.getNested(data, token);
                }
            });
            let code = sanitized;
            for (const key in values) {
                const val = values[key];
                const repl = JSON.stringify(val);
                code = code.replace(new RegExp('\\b' + key + '\\b', 'g'), repl);
            }
            try {
                const fn = new Function('return !!(' + code + ')');
                return fn();
            } catch (e) {
                return false;
            }
        },

        // 获取父级数据
        getParentData(data, levels) {
            let result = data;
            for (let i = 0; i < levels; i++) {
                if (result && result.parent) {
                    result = result.parent;
                } else {
                    return undefined;
                }
            }
            return result;
        },

        // 拆分 #if 块中的 #else / #else-if 分支
        _splitIfBranches(content) {
            const markers = [];
            const regex = /\{\{#else(?:\s+if\s+([^}]+))?\}\}/g;
            let match;
            while ((match = regex.exec(content)) !== null) {
                markers.push({
                    index: match.index,
                    endIndex: match.index + match[0].length,
                    condition: match[1] ? match[1].trim() : null,
                    full: match[0]
                });
            }
            if (markers.length === 0) {
                return [{ condition: null, content: content }];
            }
            const branches = [];
            branches.push({ condition: null, content: content.substring(0, markers[0].index) });
            for (let i = 0; i < markers.length; i++) {
                const start = markers[i].endIndex;
                const end = i < markers.length - 1 ? markers[i + 1].index : content.length;
                branches.push({
                    condition: markers[i].condition,
                    content: content.substring(start, end)
                });
            }
            return branches;
        },

        // 增强的块解析
        parseBlocks(template, data, level, onceCache) {
            if (!template) return '';
            level = level || 0;
            onceCache = onceCache || {};
            var blockRegex = /\{\{#(each|if|for|show|once)\s*([^}]*)}\}([\s\S]*?)\{\{\/\1\}\}/g;
            let result = template;
            let match;
            const blocks = [];
            while ((match = blockRegex.exec(template)) !== null) {
                blocks.push({
                    full: match[0],
                    type: match[1],
                    key: match[2].trim(),
                    content: match[3],
                    index: match.index
                });
            }
            for (let i = blocks.length - 1; i >= 0; i--) {
                const block = blocks[i];
                if (block.type === 'for') {
                    const forMatch = block.key.match(/^(\w+)\s+of\s+([\w.]+)(?:\s+key\s*=\s*"([^"]*)")?\s*$/);
                    if (forMatch) {
                        const itemName = forMatch[1];
                        const itemsPath = forMatch[2];
                        const trackKey = forMatch[3] || null;
                        const items = utils.getNested(data, itemsPath);
                        if (utils.isArray(items) && items.length > 0) {
                            let rendered = '';
                            for (let idx = 0; idx < items.length; idx++) {
                                const listItem = items[idx];
                                const ctx = { ...data, index: idx, parent: data };
                                ctx[itemName] = listItem;
                                let keyVal = idx;
                                if (trackKey) {
                                    const k = utils.getNested(listItem, trackKey);
                                    if (k !== undefined) keyVal = k;
                                }
                                ctx['@key'] = keyVal;
                                let itemContent = utils.parseBlocks(block.content, ctx, level + 1, onceCache);
                                itemContent = utils.interpolateWithContext(itemContent, ctx);
                                rendered += '<shadowit-key data-key="' + keyVal + '">' + itemContent + '</shadowit-key>';
                            }
                            result = result.replace(block.full, rendered);
                        } else {
                            result = result.replace(block.full, '');
                        }
                    }
                } else if (block.type === 'each') {
                    console.warn('[shadowit] #each 语法已废弃，请改用 #for of 语法。示例: {{#for item of items key="id"}}');
                    let keyExpr = block.key;
                    let trackKey = null;
                    const trackMatch = keyExpr.match(/^(.+?)\s+track\s+by\s+([\w.]+)$/);
                    if (trackMatch) {
                        keyExpr = trackMatch[1].trim();
                        trackKey = trackMatch[2].trim();
                    }
                    const items = utils.getNested(data, keyExpr);
                    if (utils.isArray(items) && items.length > 0) {
                        let rendered = '';
                        for (let idx = 0; idx < items.length; idx++) {
                            const listItem = items[idx];
                            const ctx = { ...data, item: listItem, index: idx, parent: data };
                            let keyVal = idx;
                            if (trackKey) {
                                const k = utils.getNested(listItem, trackKey);
                                if (k !== undefined) keyVal = k;
                            }
                            ctx['@key'] = keyVal;
                            let itemContent = utils.parseBlocks(block.content, ctx, level + 1, onceCache);
                            itemContent = utils.interpolateWithContext(itemContent, ctx);
                            rendered += '<shadowit-key data-key="' + keyVal + '">' + itemContent + '</shadowit-key>';
                        }
                        result = result.replace(block.full, rendered);
                    } else {
                        result = result.replace(block.full, '');
                    }
                } else if (block.type === 'if') {
                    const branches = utils._splitIfBranches(block.content);
                    let rendered = '';
                    for (const branch of branches) {
                        if (branch.condition === null || utils.safeEvalIf(branch.condition, data)) {
                            rendered = utils.parseBlocks(branch.content, data, level + 1, onceCache);
                            break;
                        }
                    }
                    result = result.replace(block.full, rendered);
                } else if (block.type === 'show') {
                    // {{#show expr}}...{{/show}} — 条件为假时 display:none
                    var showVal = utils.safeEvalIf(block.key, data);
                    var showContent = utils.parseBlocks(block.content, data, level + 1, onceCache);
                    if (showVal) {
                        result = result.replace(block.full, showContent);
                    } else {
                        result = result.replace(block.full, '<shadowit-key data-key="hidden" style="display:none">' + showContent + '</shadowit-key>');
                    }
                } else if (block.type === 'once') {
                    // {{#once}}...{{/once}} — 只渲染一次，后续用缓存
                    var cacheKey = 'once_' + block.index;
                    if (onceCache[cacheKey]) {
                        result = result.replace(block.full, onceCache[cacheKey]);
                    } else {
                        var onceRendered = utils.parseBlocks(block.content, data, level + 1, onceCache);
                        onceCache[cacheKey] = onceRendered;
                        result = result.replace(block.full, onceRendered);
                    }
                }
            }
            return result;
        },

        // 带上下文插值
        interpolateWithContext(template, data) {
            if (!template) return '';
            template = utils.stripComments(template);
            return template.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
                const trimmed = expr.trim();
                if (/^\.\.\//.test(trimmed)) {
                    const parts = trimmed.split('/');
                    let levels = 0;
                    let path = '';
                    for (const part of parts) {
                        if (part === '..') levels++;
                        else { path = part; break; }
                    }
                    const parentData = utils.getParentData(data, levels);
                    if (parentData) {
                        const val = utils.getNested(parentData, path);
                        return val !== undefined && val !== null ? String(val) : '';
                    }
                    return '';
                }
                if (/^[a-zA-Z_$][\w.$]*$/.test(trimmed)) {
                    const value = utils.getNested(data, trimmed);
                    return value !== undefined && value !== null ? String(value) : '';
                }
                return '';
            });
        },

        renderTemplate(template, data, onceCache) {
            if (!template) return '';
            template = utils.stripComments(template);
            let html = utils.parseBlocks(template, data, 0, onceCache);
            html = utils.interpolate(html, data);
            return html;
        },

        createStyleElement(css, id) {
            const style = document.createElement('style');
            if (id) style.setAttribute('data-shadowit', id);
            style.textContent = css;
            return style;
        },

        htmlToNodes(html) {
            const template = document.createElement('template');
            template.innerHTML = html.trim();
            return template.content;
        },

        extractSlots(hostElement) {
            const slots = {};
            const children = Array.from(hostElement.children);
            for (const child of children) {
                const slotName = child.getAttribute('slot');
                if (slotName) {
                    if (!slots[slotName]) slots[slotName] = [];
                    slots[slotName].push(child.cloneNode(true));
                    child.remove();
                }
            }
            const defaultChildren = Array.from(hostElement.childNodes)
                .filter(function(node) { return node.nodeType === 1 || (node.nodeType === 3 && node.textContent.trim()); });
            if (defaultChildren.length > 0) {
                slots['default'] = defaultChildren.map(function(node) { return node.cloneNode(true); });
            }
            return slots;
        },

        // 精细 diff
        patchDom(oldNode, newNode) {
            if (oldNode.nodeType !== newNode.nodeType) {
                oldNode.parentNode.replaceChild(newNode, oldNode);
                return;
            }
            if (oldNode.nodeType === Node.TEXT_NODE) {
                if (oldNode.textContent !== newNode.textContent) {
                    oldNode.textContent = newNode.textContent;
                }
                return;
            }
            if (oldNode.nodeType === Node.ELEMENT_NODE) {
                if (oldNode.tagName === 'SHADOWIT-KEY' && newNode.tagName === 'SHADOWIT-KEY') {
                    var oldKey = oldNode.getAttribute('data-key');
                    var newKey = newNode.getAttribute('data-key');
                    if (oldKey !== newKey) {
                        oldNode.parentNode.replaceChild(newNode.cloneNode(true), oldNode);
                        return;
                    }
                    var oldChild = oldNode.firstChild;
                    var newChild = newNode.firstChild;
                    if (oldChild && newChild) {
                        utils.patchDom(oldChild, newChild);
                    } else if (!oldChild && newChild) {
                        oldNode.appendChild(newChild.cloneNode(true));
                    } else if (oldChild && !newChild) {
                        oldNode.removeChild(oldChild);
                    }
                    return;
                }
                var oldAttrs = oldNode.attributes;
                var newAttrs = newNode.attributes;
                for (var ai = 0; ai < oldAttrs.length; ai++) {
                    var attr = oldAttrs[ai];
                    if (!newNode.hasAttribute(attr.name)) {
                        oldNode.removeAttribute(attr.name);
                    }
                }
                for (var bi = 0; bi < newAttrs.length; bi++) {
                    var nattr = newAttrs[bi];
                    if (oldNode.getAttribute(nattr.name) !== nattr.value) {
                        oldNode.setAttribute(nattr.name, nattr.value);
                    }
                }
                if (oldNode.tagName !== newNode.tagName) {
                    oldNode.parentNode.replaceChild(newNode.cloneNode(true), oldNode);
                    return;
                }
                var oldChildren = Array.from(oldNode.childNodes);
                var newChildren = Array.from(newNode.childNodes);
                var oldKeys = oldChildren.filter(function(c) { return c.nodeType === 1 && c.tagName === 'SHADOWIT-KEY'; });
                var newKeys = newChildren.filter(function(c) { return c.nodeType === 1 && c.tagName === 'SHADOWIT-KEY'; });
                if (oldKeys.length > 0 || newKeys.length > 0) {
                    var keyMap = new Map();
                    oldKeys.forEach(function(c) { keyMap.set(c.getAttribute('data-key'), c); });
                    var newKeySet = new Set();
                    newKeys.forEach(function(c) { newKeySet.add(c.getAttribute('data-key')); });
                    keyMap.forEach(function(node, key) {
                        if (!newKeySet.has(key)) oldNode.removeChild(node);
                    });
                    for (var ci = newKeys.length - 1; ci >= 0; ci--) {
                        var nkc = newKeys[ci];
                        var nk = nkc.getAttribute('data-key');
                        var okc = keyMap.get(nk);
                        if (okc) {
                            var oi = okc.firstChild;
                            var ni = nkc.firstChild;
                            if (oi && ni) { utils.patchDom(oi, ni); }
                            else if (!oi && ni) { okc.appendChild(ni.cloneNode(true)); }
                            else if (oi && !ni) { okc.removeChild(oi); }
                            var curIdx = Array.from(oldNode.childNodes).indexOf(okc);
                            var tgtIdx = newKeys.length - 1 - ci;
                            if (curIdx !== tgtIdx) {
                                var refNode = oldNode.childNodes[tgtIdx];
                                if (refNode) { oldNode.insertBefore(okc, refNode); }
                                else { oldNode.appendChild(okc); }
                            }
                        } else {
                            var clone = nkc.cloneNode(true);
                            var ref = oldNode.childNodes[ci + 1] || null;
                            oldNode.insertBefore(clone, ref);
                        }
                    }
                    var nonKeyOld = oldChildren.filter(function(c) { return !(c.nodeType === 1 && c.tagName === 'SHADOWIT-KEY'); });
                    var nonKeyNew = newChildren.filter(function(c) { return !(c.nodeType === 1 && c.tagName === 'SHADOWIT-KEY'); });
                    var maxLen = Math.max(nonKeyOld.length, nonKeyNew.length);
                    for (var di = 0; di < maxLen; di++) {
                        if (di < nonKeyOld.length && di < nonKeyNew.length) {
                            utils.patchDom(nonKeyOld[di], nonKeyNew[di]);
                        } else if (di < nonKeyOld.length) {
                            oldNode.removeChild(nonKeyOld[di]);
                        } else {
                            oldNode.appendChild(nonKeyNew[di].cloneNode(true));
                        }
                    }
                } else {
                    var maxL = Math.max(oldChildren.length, newChildren.length);
                    for (var ei = 0; ei < maxL; ei++) {
                        if (ei < oldChildren.length && ei < newChildren.length) {
                            utils.patchDom(oldChildren[ei], newChildren[ei]);
                        } else if (ei < oldChildren.length) {
                            oldNode.removeChild(oldChildren[ei]);
                        } else {
                            oldNode.appendChild(newChildren[ei].cloneNode(true));
                        }
                    }
                }
            }
        },

        patchInner(container, newHtml) {
            var oldHtml = container.innerHTML;
            if (oldHtml === newHtml) return;
            var newFragment = utils.htmlToNodes(newHtml);
            var oldRoot = container.firstChild;
            var newRoot = newFragment.firstChild;
            if (oldRoot && newRoot && oldRoot.nodeType === Node.ELEMENT_NODE && newRoot.nodeType === Node.ELEMENT_NODE) {
                utils.patchDom(oldRoot, newRoot);
            } else {
                container.innerHTML = newHtml;
            }
        }
    };

    // ============================================================
    // 事件管理器
    // ============================================================
    function EventManager(target, eventsOnHost) {
        this.target = target;
        this.handlers = [];
        this.eventsOnHost = eventsOnHost || false;
    }
    EventManager.prototype.on = function(event, selector, handler) {
        if (!this.target) return this;
        var self = this;
        var wrappedHandler = function(e) {
            var target = e.target;
            var root = self.target.shadowRoot || self.target;
            while (target && target !== root) {
                if (target.matches && target.matches(selector)) {
                    handler.call(target, e, target);
                    break;
                }
                target = target.parentNode;
            }
        };
        this.target.addEventListener(event, wrappedHandler);
        this.handlers.push({ event: event, selector: selector, handler: wrappedHandler, original: handler });
        return this;
    };
    EventManager.prototype.off = function(event, selector, handler) {
        if (!this.target) return this;
        var toRemove = [];
        for (var i = 0; i < this.handlers.length; i++) {
            var h = this.handlers[i];
            if (h.event === event && h.selector === selector && h.original === handler) {
                this.target.removeEventListener(event, h.handler);
                toRemove.push(h);
            }
        }
        for (var j = 0; j < toRemove.length; j++) {
            var idx = this.handlers.indexOf(toRemove[j]);
            if (idx > -1) this.handlers.splice(idx, 1);
        }
        return this;
    };
    EventManager.prototype.offAll = function() {
        if (!this.target) return this;
        for (var i = 0; i < this.handlers.length; i++) {
            this.target.removeEventListener(this.handlers[i].event, this.handlers[i].handler);
        }
        this.handlers = [];
        return this;
    };
    EventManager.prototype.destroy = function() {
        this.offAll();
        this.target = null;
    };

    // ============================================================
    // ShadowIt 核心类
    // ============================================================
    function ShadowIt(host, options) {
        if (!isSupported()) {
            console.warn('[shadowit] 当前浏览器不支持 Shadow DOM 或 Custom Elements，请加载 polyfill。');
        }
        options = options || {};

        // 统一 styles → css
        var cssVal = options.css || options.styles || '';

        this.options = {
            template: options.template || '',
            css: cssVal,
            data: options.data || {},
            mode: options.mode || 'open',
            slots: options.slots || {},
            lifecycle: options.lifecycle || {},
            onError: options.onError || null,
            eventsOnHost: options.eventsOnHost || false,
            name: options.name || null
        };

        this._id = utils.uid();
        this._data = utils.deepClone(this.options.data);
        this._slots = utils.deepClone(this.options.slots);
        this._rendered = false;
        this._destroyed = false;
        this._mounted = false;
        this._pendingSelector = null;
        this._queryCache = new Map();
        this._onceCache = {};

        this._host = null;
        this._root = null;
        this._container = null;
        this._lastHtml = '';

        this._eventManager = null;

        this._lifecycle = {
            beforeRender: this.options.lifecycle.beforeRender || null,
            afterRender: this.options.lifecycle.afterRender || null,
            beforeUpdate: this.options.lifecycle.beforeUpdate || null,
            afterUpdate: this.options.lifecycle.afterUpdate || null,
            destroy: this.options.lifecycle.destroy || null
        };

        this._name = this.options.name;
        if (this._name && typeof this._name === 'string') {
            var store = shadowit._instanceStore || shadowit.instance;
            if (store[this._name]) {
                console.warn('[shadowit] 实例名称 "' + this._name + '" 已存在，将被覆盖。');
            }
            store[this._name] = this;
        }

        if (host) {
            this.mount(host);
        }
    }

    ShadowIt._rootSeed = 0;

    ShadowIt.prototype.mount = function(host) {
        if (this._destroyed) throw new Error('[shadowit] 实例已销毁，无法挂载');
        if (this._mounted) throw new Error('[shadowit] 实例已经挂载，不能重复挂载');
        if (!host) throw new Error('[shadowit] mount() 需要指定宿主元素');

        this._host = typeof host === 'string' ? document.querySelector(host) : host;
        if (!this._host) throw new Error('[shadowit] 宿主元素未找到: ' + host);

        this._root = this._host.attachShadow({ mode: this.options.mode });
        this._mounted = true;

        var eventTarget = this.options.eventsOnHost ? this._host : this._root;
        this._eventManager = new EventManager(eventTarget, this.options.eventsOnHost);

        this._applyCSS();

        if (!this.options.template) {
            while (this._host.firstChild) {
                this._root.appendChild(this._host.firstChild);
            }
            this._rendered = true;
            this._callHook('afterRender');
            return this;
        }

        this.render();
        return this;
    };

    // ----- 配置方法 -----
    ShadowIt.prototype.template = function(html) {
        if (this._destroyed) return this;
        this.options.template = html;
        return this;
    };

    ShadowIt.prototype.css = function(cssStr) {
        if (this._destroyed) return this;
        this.options.css = cssStr;
        if (this._mounted && this._rendered) this._applyCSS();
        return this;
    };

    // 兼容旧 styles 方法
    ShadowIt.prototype.styles = function(cssStr) {
        return this.css(cssStr);
    };

    ShadowIt.prototype.data = function(newData) {
        if (this._destroyed) return this;
        if (utils.isObject(newData)) utils.merge(this._data, newData);
        return this;
    };

    ShadowIt.prototype.setData = function(newData) {
        if (this._destroyed) return this;
        if (utils.isObject(newData)) this._data = utils.deepClone(newData);
        return this;
    };

    ShadowIt.prototype.getData = function() {
        return utils.deepClone(this._data);
    };

    ShadowIt.prototype.slot = function(name, content) {
        if (this._destroyed) return this;
        this._slots[name] = content;
        if (this._mounted && this._rendered) this.render();
        return this;
    };

    // ----- 渲染与更新 -----
    ShadowIt.prototype.render = function() {
        if (this._destroyed) throw new Error('[shadowit] 实例已销毁');
        if (!this._mounted) throw new Error('[shadowit] 实例尚未挂载，请先调用 mount(host)');

        try {
            this._callHook('beforeRender');
            this._root.innerHTML = '';

            var hostSlots = utils.extractSlots(this._host);
            var allSlots = {};
            for (var key in this._slots) { if (this._slots.hasOwnProperty(key)) allSlots[key] = this._slots[key]; }
            for (var hk in hostSlots) {
                if (hostSlots.hasOwnProperty(hk) && hostSlots[hk] && hostSlots[hk].length > 0) {
                    allSlots[hk] = hostSlots[hk];
                }
            }
            var renderData = {};
            for (var dk in this._data) { if (this._data.hasOwnProperty(dk)) renderData[dk] = this._data[dk]; }
            renderData._slots = allSlots;

            var html = this.options.template || '';
            if (utils.isFunction(html)) {
                html = html(renderData);
            }
            if (utils.isString(html)) {
                html = utils.renderTemplate(html, renderData, this._onceCache);
            }

            var fragment = utils.htmlToNodes(html);
            this._root.appendChild(fragment);
            this._container = this._root.firstChild;
            this._rendered = true;
            this._lastHtml = html;

            this._processTemplateEvents();
            this._queryCache.clear();
            if (shadowit._cacheEnabled) {
                shadowit.clearQueryCache();
            }
            this._callHook('afterRender');
        } catch (err) {
            this._handleError(err, 'render');
        }
        return this;
    };

    ShadowIt.prototype.update = function(newData) {
        if (this._destroyed) {
            console.warn('[shadowit] 实例已销毁，无法更新');
            return this;
        }
        if (!this._mounted) {
            if (utils.isObject(newData)) utils.merge(this._data, newData);
            return this;
        }

        try {
            this._callHook('beforeUpdate', newData);
            if (utils.isObject(newData)) utils.merge(this._data, newData);

            var hostSlots = utils.extractSlots(this._host);
            var allSlots = {};
            for (var key in this._slots) { if (this._slots.hasOwnProperty(key)) allSlots[key] = this._slots[key]; }
            for (var hk in hostSlots) {
                if (hostSlots.hasOwnProperty(hk) && hostSlots[hk] && hostSlots[hk].length > 0) {
                    allSlots[hk] = hostSlots[hk];
                }
            }
            var renderData = {};
            for (var dk in this._data) { if (this._data.hasOwnProperty(dk)) renderData[dk] = this._data[dk]; }
            renderData._slots = allSlots;

            var html = this.options.template || '';
            if (utils.isFunction(html)) {
                html = html(renderData);
            }
            if (utils.isString(html)) {
                html = utils.renderTemplate(html, renderData, this._onceCache);
            }

            if (this._container && this._lastHtml !== undefined) {
                utils.patchInner(this._container, html);
                this._lastHtml = html;
            } else {
                this.render();
                return this;
            }

            this._processTemplateEvents();
            this._queryCache.clear();
            if (shadowit._cacheEnabled) {
                shadowit.clearQueryCache();
            }
            this._callHook('afterUpdate', newData);
        } catch (err) {
            this._handleError(err, 'update');
        }
        return this;
    };

    ShadowIt.prototype.refresh = function() {
        if (this._destroyed) return this;
        if (!this._mounted) throw new Error('[shadowit] 实例尚未挂载，请先调用 mount(host)');
        this.render();
        return this;
    };

    // ----- 事件绑定 -----
    ShadowIt.prototype.on = function(event, selector, handler) {
        if (this._destroyed) return this;
        if (!this._mounted) throw new Error('[shadowit] 实例尚未挂载，请先调用 mount(host)');
        this._eventManager.on(event, selector, handler);
        return this;
    };

    ShadowIt.prototype.off = function(event, selector, handler) {
        if (this._destroyed) return this;
        if (!this._mounted) throw new Error('[shadowit] 实例尚未挂载，请先调用 mount(host)');
        this._eventManager.off(event, selector, handler);
        return this;
    };

    // ----- 查询 -----
    ShadowIt.prototype.getRoot = function() { return this._root; };
    ShadowIt.prototype.getHost = function() { return this._host; };
    ShadowIt.prototype.isRendered = function() { return this._rendered; };
    ShadowIt.prototype.isDestroyed = function() { return this._destroyed; };
    ShadowIt.prototype.isMounted = function() { return this._mounted; };

    ShadowIt.prototype.querySelector = function(selector, root) {
        if (!this._mounted) throw new Error('[shadowit] 实例尚未挂载，请先调用 mount(host)');
        root = utils.resolveRoot(root) || this._root;
        return root.querySelector(selector);
    };

    ShadowIt.prototype.querySelectorAll = function(selector, root) {
        if (!this._mounted) throw new Error('[shadowit] 实例尚未挂载，请先调用 mount(host)');
        root = utils.resolveRoot(root) || this._root;
        return Array.from(root.querySelectorAll(selector));
    };

    ShadowIt.prototype.getName = function() { return this._name; };
    ShadowIt.prototype.getId = function() { return this._id; };

    // ----- 内部方法 -----
    ShadowIt.prototype._callHook = function(name) {
        var args = Array.prototype.slice.call(arguments, 1);
        var hook = this._lifecycle[name];
        if (utils.isFunction(hook)) {
            try { hook.apply(this, args); } catch (err) {
                this._handleError(err, 'lifecycle.' + name);
            }
        }
    };

    ShadowIt.prototype._handleError = function(err, context) {
        console.error('[shadowit] 错误发生在 ' + context + ':', err);
        if (utils.isFunction(this.options.onError)) {
            this.options.onError(err, context);
        }
    };

    ShadowIt.prototype._applyCSS = function() {
        if (!this._root) return this;
        var oldStyles = this._root.querySelectorAll('style[data-shadowit]');
        for (var i = 0; i < oldStyles.length; i++) oldStyles[i].remove();
        if (this.options.css) {
            var styleEl = utils.createStyleElement(this.options.css, this._id);
            this._root.prepend(styleEl);
        }
        return this;
    };

    ShadowIt.prototype._processTemplateEvents = function() {
        if (!this._root) return this;
        var all = this._root.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            var attrs = el.getAttributeNames ? el.getAttributeNames() : [];
            for (var j = attrs.length - 1; j >= 0; j--) {
                var name = attrs[j];
                if (name.charAt(0) === '@' && name !== '@key') {
                    var event = name.slice(1);
                    var handlerName = el.getAttribute(name);
                    el.removeAttribute(name);
                    if (handlerName) {
                        var fn = utils.isFunction(this._data[handlerName]) ? this._data[handlerName] :
                            (utils.isFunction(this.options.methods && this.options.methods[handlerName]) ? this.options.methods[handlerName] : null);
                        if (fn) {
                            el.addEventListener(event, function(e) {
                                fn.call(el, e, el);
                            });
                        }
                    }
                }
            }
        }
        return this;
    };

    ShadowIt.prototype._startObserver = function() {
        if (!this._pendingSelector) return this;
        var self = this;
        var selector = this._pendingSelector;
        var existing = document.querySelector(selector);
        if (existing) {
            this._pendingSelector = null;
            this.mount(existing);
            return this;
        }
        var observer = new MutationObserver(function() {
            var el = document.querySelector(selector);
            if (el) {
                observer.disconnect();
                self._pendingSelector = null;
                try {
                    self.mount(el);
                } catch (err) {
                    self._handleError(err, 'auto-mount');
                }
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        return this;
    };

    // ----- 快捷方法 -----
    ShadowIt.prototype.getHTML = function() {
        return this._root ? this._root.innerHTML : '';
    };

    ShadowIt.prototype.getShadowDOM = function() {
        if (!this._mounted || !this._root) return [];
        var results = [];
        var walk = function(node) {
            if (node.nodeType === Node.ELEMENT_NODE && node.shadowRoot) {
                results.push(node);
            }
            if (node.children) {
                for (var i = 0; i < node.children.length; i++) {
                    walk(node.children[i]);
                }
            }
        };
        for (var i = 0; i < this._root.children.length; i++) {
            walk(this._root.children[i]);
        }
        return results;
    };

    // ----- qS / qSAll (带缓存) -----
    ShadowIt.prototype._rootKey = function(root) {
        if (root === this._root) return '__root__';
        if (!root.__sdit_ck) root.__sdit_ck = 'r' + (++ShadowIt._rootSeed);
        return root.__sdit_ck;
    };

    ShadowIt.prototype.qS = function(selector, root) {
        if (!this._mounted) throw new Error('[shadowit] 实例尚未挂载，请先调用 mount(host)');
        root = utils.resolveRoot(root) || this._root;
        if (!root) return null;
        var cacheKey = selector + '|qS|' + this._rootKey(root);
        if (this._queryCache.has(cacheKey)) {
            return this._wrapResult(this._queryCache.get(cacheKey));
        }
        var result = root.querySelector(selector);
        this._queryCache.set(cacheKey, result);
        return this._wrapResult(result);
    };

    ShadowIt.prototype.qSAll = function(selector, root) {
        if (!this._mounted) throw new Error('[shadowit] 实例尚未挂载，请先调用 mount(host)');
        root = utils.resolveRoot(root) || this._root;
        if (!root) return [];
        var cacheKey = selector + '|qSA|' + this._rootKey(root);
        if (this._queryCache.has(cacheKey)) {
            var cached = this._queryCache.get(cacheKey);
            return cached.map(this._wrapResult.bind(this));
        }
        var result = Array.from(root.querySelectorAll(selector));
        this._queryCache.set(cacheKey, result);
        return result.map(this._wrapResult.bind(this));
    };

    // 给查询结果挂载 .remove / .template / .css 方法
    ShadowIt.prototype._wrapResult = function(el) {
        if (!el) return el;
        if (el.__sdit_wrapped) return el;
        var self = this;
        var origRemove = el.remove ? el.remove.bind(el) : function() {
            if (el.parentNode) el.parentNode.removeChild(el);
        };
        el.remove = function() {
            var store = shadowit._instanceStore || shadowit.instance;
            for (var key in store) {
                if (store.hasOwnProperty(key)) {
                    var inst = store[key];
                    if (inst._host === el) {
                        inst.destroy();
                        break;
                    }
                }
            }
            return origRemove();
        };
        el.template = function(tpl) {
            self.options.template = tpl;
            if (self._mounted && self._rendered) self.render();
            return el;
        };
        el.css = function(cssStr) {
            self.options.css = cssStr;
            if (self._mounted && self._rendered) self._applyCSS();
            return el;
        };
        el.__sdit_wrapped = true;
        return el;
    };

    // ----- copy / paste -----
    ShadowIt.prototype.copy = function(source, target) {
        var srcEl = utils.resolveHost(source);
        if (!srcEl) return null;
        var wrapper = document.createElement('div');
        wrapper.setAttribute('data-sdit-copy', '');
        var clone = srcEl.cloneNode(true);
        wrapper.appendChild(clone);
        var shadow = wrapper.attachShadow({ mode: 'open' });
        while (wrapper.firstChild) {
            shadow.appendChild(wrapper.firstChild);
        }
        var self = this;
        var clipboard = {
            el: wrapper,
            paste: function(dest) {
                if (!dest) return clipboard;
                var destEl = utils.resolveHost(dest);
                if (destEl) {
                    destEl.appendChild(wrapper);
                }
                return clipboard;
            }
        };
        if (target) {
            clipboard.paste(target);
        }
        return clipboard;
    };

    // ----- destroy -----
    ShadowIt.prototype.destroy = function() {
        if (this._destroyed) return this;
        try {
            this._callHook('destroy');
        } catch (err) {
            this._handleError(err, 'destroy');
        }
        if (this._eventManager) {
            this._eventManager.destroy();
            this._eventManager = null;
        }
        if (this._root) {
            this._root.innerHTML = '';
            this._root = null;
        }
        this._host = null;
        this._container = null;
        this._destroyed = true;
        this._mounted = false;
        this._rendered = false;

        var store = shadowit._instanceStore || shadowit.instance;
        if (this._name && store[this._name] === this) {
            delete store[this._name];
        }
        return this;
    };

    // ============================================================
    // 全局查询
    // ============================================================
    var _queryCache = new Map();
    var _cacheEnabled = false;

    function globalQuery(selector, root, all) {
        var cacheKey = selector + '|' + (root === document ? 'document' : (root.id || root.tagName));
        if (_cacheEnabled && _queryCache.has(cacheKey)) {
            var cached = _queryCache.get(cacheKey);
            return all ? cached : (cached.length > 0 ? cached[0] : null);
        }

        var results = [];
        var stack = [root];
        while (stack.length) {
            var node = stack.pop();
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.matches && node.matches(selector)) {
                    if (!all) {
                        if (_cacheEnabled) _queryCache.set(cacheKey, [node]);
                        return node;
                    }
                    results.push(node);
                }
                if (node.shadowRoot && node.shadowRoot.mode === 'open') {
                    stack.push(node.shadowRoot);
                }
                if (node.children) {
                    for (var i = node.children.length - 1; i >= 0; i--) {
                        stack.push(node.children[i]);
                    }
                }
            } else if (node.children) {
                for (var j = node.children.length - 1; j >= 0; j--) {
                    stack.push(node.children[j]);
                }
            }
        }
        if (_cacheEnabled) _queryCache.set(cacheKey, results);
        return all ? results : null;
    }

    // ============================================================
    // 批处理更新
    // ============================================================
    var _batchUpdates = [];
    var _batchScheduled = false;

    function flushBatch() {
        var updates = _batchUpdates.slice();
        _batchUpdates = [];
        _batchScheduled = false;
        updates.forEach(function(item) {
            item.instance.update(item.data);
        });
    }

    // ============================================================
    // 全局 shadowit 函数
    // ============================================================
    function shadowit(host, options) {
        // 新签名: sdit(tpl, css/element/selector, element/selector)
        if (utils.isString(host) && arguments.length >= 2) {
            var arg1 = arguments[0]; // template
            var arg2 = arguments[1]; // css | element | selector
            var arg3 = arguments[2]; // element | selector (only if arg2 is css)

            if (utils.isCSS(arg2)) {
                // sdit(tpl, css) 或 sdit(tpl, css, element/selector)
                var opts = { template: arg1, css: arg2 };
                if (arg3) {
                    var h = utils.resolveHost(arg3);
                    if (h) return new ShadowIt(h, opts);
                    // 如果找不到，尝试 observer
                    if (utils.isString(arg3)) {
                        var inst = new ShadowIt(null, opts);
                        inst._pendingSelector = arg3;
                        inst._startObserver();
                        return inst;
                    }
                }
                return new ShadowIt(null, opts);
            }

            if (arg2 instanceof Element) {
                // sdit(tpl, element)
                return new ShadowIt(arg2, { template: arg1 });
            }

            if (utils.isString(arg2)) {
                // sdit(tpl, selector)
                var h2 = utils.resolveHost(arg2);
                if (h2) return new ShadowIt(h2, { template: arg1 });
                var inst2 = new ShadowIt(null, { template: arg1 });
                inst2._pendingSelector = arg2;
                inst2._startObserver();
                return inst2;
            }
        }

        // 判断是否传入配置对象作为第一参数
        if (host && typeof host === 'object' && !(host instanceof Element) && !utils.isString(host)) {
            return new ShadowIt(null, host);
        }

        // 传统方式
        if (utils.isString(options) || utils.isFunction(options)) {
            options = { template: options };
        }
        if (!options) options = {};

        if (utils.isString(host) && !document.querySelector(host)) {
            var inst = new ShadowIt(null, options);
            inst._pendingSelector = host;
            inst._startObserver();
            return inst;
        }

        return new ShadowIt(host, options);
    }

    shadowit.version = '0.12.0';
    shadowit.utils = utils;
    shadowit.ShadowIt = ShadowIt;
    shadowit.isSupported = isSupported;

    // 命名实例
    shadowit.instance = {};
    shadowit._instanceStore = null;
    shadowit.setInstanceStore = function(store) {
        if (store && typeof store === 'object') {
            shadowit._instanceStore = store;
        } else {
            shadowit._instanceStore = shadowit.instance;
        }
        return shadowit;
    };
    shadowit.getInstance = function(name) {
        var store = shadowit._instanceStore || shadowit.instance;
        return store[name] || null;
    };
    shadowit.unregisterInstance = function(name) {
        var store = shadowit._instanceStore || shadowit.instance;
        if (store[name]) {
            delete store[name];
        }
        return shadowit;
    };

    // 全局查询
    shadowit.querySelector = function(selector, root) {
        root = utils.resolveRoot(root);
        return globalQuery(selector, root, false);
    };
    shadowit.querySelectorAll = function(selector, root) {
        root = utils.resolveRoot(root);
        return globalQuery(selector, root, true) || [];
    };
    shadowit.enableQueryCache = function(enable) {
        _cacheEnabled = enable !== false;
        if (!_cacheEnabled) _queryCache.clear();
        return shadowit;
    };
    shadowit.clearQueryCache = function() {
        _queryCache.clear();
        return shadowit;
    };
    shadowit._cacheEnabled = false;

    // 批处理更新
    shadowit.batchUpdate = function(instance, data) {
        _batchUpdates.push({ instance: instance, data: data });
        if (!_batchScheduled) {
            _batchScheduled = true;
            requestAnimationFrame(flushBatch);
        }
        return shadowit;
    };

    // ============================================================
    // remove / removeAll
    // ============================================================
    shadowit.remove = function(name, root) {
        root = utils.resolveRoot(root);
        var store = shadowit._instanceStore || shadowit.instance;
        var inst = store[name];
        if (inst && inst._host && root.contains(inst._host)) {
            inst.destroy();
        }
        return shadowit;
    };

    shadowit.removeAll = function(root) {
        root = utils.resolveRoot(root);
        var store = shadowit._instanceStore || shadowit.instance;
        var keys = [];
        for (var key in store) {
            if (store.hasOwnProperty(key)) keys.push(key);
        }
        for (var i = 0; i < keys.length; i++) {
            var inst = store[keys[i]];
            if (inst && inst.destroy && inst._host && root.contains(inst._host)) {
                inst.destroy();
            }
        }
        return shadowit;
    };

    // ============================================================
    // scan - 扫描所有未挂载的 Shadow DOM 到 sdit.instance
    // ============================================================
    shadowit.scan = function(root) {
        root = utils.resolveRoot(root);
        var store = shadowit._instanceStore || shadowit.instance;
        var walk = function(node) {
            if (node.shadowRoot && node.shadowRoot.mode === 'open') {
                var name = node.getAttribute('data-sdit-name') || node.id || (node.tagName ? node.tagName.toLowerCase() : '') + '-' + Date.now().toString(36);
                if (!store[name]) {
                    var inst = new ShadowIt(null, { name: name });
                    inst._host = node;
                    inst._root = node.shadowRoot;
                    inst._mounted = true;
                    inst._rendered = true;
                    store[name] = inst;
                }
            }
            if (node.children) {
                for (var i = 0; i < node.children.length; i++) {
                    walk(node.children[i]);
                }
            }
            if (node.shadowRoot) {
                for (var j = 0; j < node.shadowRoot.children.length; j++) {
                    walk(node.shadowRoot.children[j]);
                }
            }
        };
        walk(root);
        return shadowit;
    };

    // ============================================================
    // copy - 全局复制方法
    // ============================================================
    shadowit.copy = function(source, target) {
        var srcEl = utils.resolveHost(source);
        if (!srcEl) return null;
        var wrapper = document.createElement('div');
        wrapper.setAttribute('data-sdit-copy', '');
        var clone = srcEl.cloneNode(true);
        wrapper.appendChild(clone);
        var shadow = wrapper.attachShadow({ mode: 'open' });
        while (wrapper.firstChild) {
            shadow.appendChild(wrapper.firstChild);
        }
        var clipboard = {
            el: wrapper,
            paste: function(dest) {
                if (!dest) return clipboard;
                var destEl = utils.resolveHost(dest);
                if (destEl) {
                    destEl.appendChild(wrapper);
                }
                return clipboard;
            }
        };
        if (target) {
            clipboard.paste(target);
        }
        return clipboard;
    };

    // ============================================================
    // 接管原生 Shadow DOM
    // ============================================================
    (function() {
        if (Element.prototype.__sdit_attachShadow) return;
        var origAttachShadow = Element.prototype.attachShadow;
        Element.prototype.__sdit_attachShadow = true;
        Element.prototype.attachShadow = function(init) {
            var root = origAttachShadow.call(this, init);
            if (init && init.mode === 'open') {
                var name = this.getAttribute('data-sdit-name') || this.id ||
                    (this.tagName ? this.tagName.toLowerCase() : 'el') + '-' + Date.now().toString(36);
                var store = shadowit._instanceStore || shadowit.instance;
                if (!store[name]) {
                    var inst = new ShadowIt(null, { name: name });
                    inst._host = this;
                    inst._root = root;
                    inst._mounted = true;
                    inst._rendered = true;
                    store[name] = inst;
                }
            }
            return root;
        };
    })();

    // ============================================================
    // 自定义标签注册
    // ============================================================
    shadowit.define = function(name, tpl, css) {
        // 新签名: sdit.define(name, tpl, css)
        if (utils.isString(tpl) && !utils.isObject(arguments[1])) {
            var opts = { template: tpl };
            if (css) opts.css = css;
            return shadowit._define(name, opts);
        }
        // 旧签名: sdit.define(name, options)
        return shadowit._define(name, tpl || {});
    };

    shadowit._define = function(tagName, options) {
        if (!tagName.includes('-')) {
            throw new Error('[shadowit] 自定义标签名必须包含中划线 "-"，例如 "my-component"');
        }

        var template = options.template || '';
        var cssVal = options.css || options.styles || '';
        var data = options.data || {};
        var lifecycle = options.lifecycle || {};
        var observedAttributes = options.observedAttributes || [];
        var attributeChanged = options.attributeChanged || null;
        var connected = options.connected || null;
        var disconnected = options.disconnected || null;
        var cname = options.name || null;
        var onError = options.onError || null;
        var eventsOnHost = options.eventsOnHost || false;

        function ShadowItElement() {
            var self = Reflect.construct(HTMLElement, [], ShadowItElement);
            self._instance = null;
            self._data = {};
            for (var key in data) { if (data.hasOwnProperty(key)) self._data[key] = data[key]; }
            self._instanceName = cname || (tagName + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4));
            self._attributeChangedHandler = attributeChanged;
            self._template = template;
            self._css = cssVal;
            return self;
        }
        ShadowItElement.prototype = Object.create(HTMLElement.prototype);
        ShadowItElement.prototype.constructor = ShadowItElement;

        ShadowItElement.prototype.connectedCallback = function() {
            if (this._instance) return;
            for (var i = 0; i < observedAttributes.length; i++) {
                var attr = observedAttributes[i];
                if (this.hasAttribute(attr)) {
                    this._data[attr] = this.getAttribute(attr);
                }
            }
            var self = this;
            this._instance = shadowit(this, {
                template: this._template,
                css: this._css,
                data: this._data,
                name: this._instanceName,
                onError: onError,
                eventsOnHost: eventsOnHost,
                lifecycle: {
                    beforeRender: lifecycle.beforeRender || null,
                    afterRender: function() {
                        if (lifecycle.afterRender) lifecycle.afterRender.call(self);
                    },
                    beforeUpdate: lifecycle.beforeUpdate || null,
                    afterUpdate: lifecycle.afterUpdate || null,
                    destroy: function() {
                        if (lifecycle.destroy) lifecycle.destroy.call(self);
                    }
                }
            });
            if (connected) connected.call(this);
        };

        ShadowItElement.prototype.disconnectedCallback = function() {
            if (this._instance) {
                this._instance.destroy();
                this._instance = null;
            }
            if (disconnected) disconnected.call(this);
        };

        ShadowItElement.prototype.attributeChangedCallback = function(attrName, oldVal, newVal) {
            if (oldVal === newVal) return;
            if (this._attributeChangedHandler) {
                this._attributeChangedHandler.call(this, attrName, oldVal, newVal);
            } else {
                if (this._instance) {
                    var d = {}; d[attrName] = newVal;
                    this._instance.update(d);
                } else {
                    this._data[attrName] = newVal;
                }
            }
        };

        Object.defineProperty(ShadowItElement, 'observedAttributes', {
            get: function() { return observedAttributes; }
        });

        if (!customElements.get(tagName)) {
            customElements.define(tagName, ShadowItElement);
        }

        // 返回代理对象，包含 .destroy, .on, .off, .data, .template, .css
        return {
            _tagName: tagName,
            _elementClass: ShadowItElement,
            _getStore: function() { return shadowit._instanceStore || shadowit.instance; },
            _getInstances: function() {
                var store = this._getStore();
                var result = [];
                for (var k in store) {
                    if (store.hasOwnProperty(k) && store[k] && store[k]._host && store[k]._host.tagName === tagName.toUpperCase()) {
                        result.push(store[k]);
                    }
                }
                return result;
            },
            destroy: function() {
                var insts = this._getInstances();
                for (var i = 0; i < insts.length; i++) {
                    insts[i].destroy();
                }
            },
            on: function(event, selector, handler) {
                var insts = this._getInstances();
                for (var i = 0; i < insts.length; i++) {
                    insts[i].on(event, selector, handler);
                }
                return this;
            },
            off: function(event, selector, handler) {
                var insts = this._getInstances();
                for (var i = 0; i < insts.length; i++) {
                    insts[i].off(event, selector, handler);
                }
                return this;
            },
            data: function(newData) {
                var insts = this._getInstances();
                for (var i = 0; i < insts.length; i++) {
                    insts[i].data(newData);
                }
                return this;
            },
            template: function(tpl) {
                var insts = this._getInstances();
                for (var i = 0; i < insts.length; i++) {
                    insts[i].template(tpl);
                    insts[i].render();
                }
                return this;
            },
            css: function(cssStr) {
                var insts = this._getInstances();
                for (var i = 0; i < insts.length; i++) {
                    insts[i].css(cssStr);
                }
                return this;
            }
        };
    };

    // 别名
    shadowit.sdit = shadowit;
    shadowit.shadowIt = shadowit;

    return shadowit;
}));