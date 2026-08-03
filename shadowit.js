/**
 * shadowit - Shadow DOM 控制库 v1.4.0
 * #for of + keyed diff、#else/#else-if/#elseif、{{--注释--}}、
 * {{#show}}、{{#once}}、事件委托 @click="handler(args)"、
 * 原生 <slot> 兼容、shouldUpdate 钩子、css 函数支持、
 * WeakMap 实例管理、takeOver 开关、
 * @bind 双向绑定、computed 计算属性、Proxy 深响应式、
 * #await 异步块、#portal 传送门
 * https://github.com/monkey2582/shadowit
 * @version 1.4.2
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

    var isSupported = function() {
        return !!(document.createElement('div').attachShadow && window.customElements);
    };

    // ============================================================
    // 工具函数
    // ============================================================
    var utils = {
        isObject: function(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); },
        isFunction: function(v) { return typeof v === 'function'; },
        isString: function(v) { return typeof v === 'string'; },
        isArray: function(v) { return Array.isArray(v); },

        deepClone: function(obj) {
            if (!utils.isObject(obj) && !utils.isArray(obj)) return obj;
            var copy = utils.isArray(obj) ? [] : {};
            for (var key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    copy[key] = utils.isObject(obj[key]) || utils.isArray(obj[key]) ?
                        utils.deepClone(obj[key]) : obj[key];
                }
            }
            return copy;
        },

        merge: function(target, source) {
            if (!utils.isObject(target) || !utils.isObject(source)) return target;
            for (var key in source) {
                if (Object.prototype.hasOwnProperty.call(source, key)) {
                    target[key] = source[key];
                }
            }
            return target;
        },

        getNested: function(obj, path) {
            if (!obj || !path) return undefined;
            var keys = path.split('.');
            var result = obj;
            for (var i = 0; i < keys.length; i++) {
                if (result === undefined || result === null) return undefined;
                result = result[keys[i]];
            }
            return result;
        },

        uid: function() {
            return 'si-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8);
        },

        isCSS: function(str) {
            if (!utils.isString(str)) return false;
            return /[{};]|\n/.test(str);
        },

        resolveRoot: function(root) {
            if (!root) return document.documentElement;
            if (root instanceof Element || root === document || root instanceof DocumentFragment) return root;
            if (root.nodeType === 11) return root;
            if (utils.isString(root)) {
                try { var el = document.querySelector(root); if (el) return el; } catch (e) {}
            }
            return document.documentElement;
        },

        resolveHost: function(host) {
            if (!host) return null;
            if (host instanceof Element) return host;
            if (utils.isString(host)) {
                try { return document.querySelector(host); } catch (e) { return null; }
            }
            return null;
        },

        stripComments: function(template) {
            if (!template) return '';
            return template.replace(/\{\{--[\s\S]*?--\}\}/g, '');
        },

        // 查找 }} 闭合标记，跳过字符串字面量内的 }}（避免误匹配）
        _findClosingBraces: function(template, startPos) {
            var inSingle = false, inDouble = false;
            for (var i = startPos; i < template.length - 1; i++) {
                var ch = template[i];
                if (ch === '\\') { i++; continue; } // 跳过转义字符
                if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
                if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
                if (!inSingle && !inDouble && ch === '}' && template[i + 1] === '}') {
                    return i;
                }
            }
            return -1;
        },

        escapeHtml: function(str) {
            if (str === undefined || str === null) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        },

        // ============================================================
        // 纯路径条件求值 — 零 eval，零 XSS 风险
        // ============================================================
        evalCondition: function(expr, data) {
            if (!expr) return false;
            expr = expr.trim();
            if (expr.charAt(0) === '!') return !utils.evalCondition(expr.slice(1).trim(), data);
            if (expr.charAt(0) === '(' && expr.charAt(expr.length - 1) === ')') {
                return utils.evalCondition(expr.slice(1, -1).trim(), data);
            }
            var andIdx = expr.indexOf('&&');
            if (andIdx > -1) {
                return utils.evalCondition(expr.slice(0, andIdx).trim(), data) &&
                    utils.evalCondition(expr.slice(andIdx + 2).trim(), data);
            }
            var orIdx = expr.indexOf('||');
            if (orIdx > -1) {
                return utils.evalCondition(expr.slice(0, orIdx).trim(), data) ||
                    utils.evalCondition(expr.slice(orIdx + 2).trim(), data);
            }
            var cmpMatch = expr.match(/^([a-zA-Z_$][\w.$]*)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/);
            if (cmpMatch) {
                var lhs = utils.getNested(data, cmpMatch[1]);
                var op = cmpMatch[2];
                var rhs;
                var rhsRaw = cmpMatch[3].trim();
                if ((rhsRaw.charAt(0) === '"' && rhsRaw.charAt(rhsRaw.length - 1) === '"') ||
                    (rhsRaw.charAt(0) === "'" && rhsRaw.charAt(rhsRaw.length - 1) === "'")) {
                    rhs = rhsRaw.slice(1, -1);
                } else if (rhsRaw === 'true') { rhs = true; }
                else if (rhsRaw === 'false') { rhs = false; }
                else if (rhsRaw === 'null' || rhsRaw === 'undefined') { rhs = null; }
                else if (/^-?\d+(\.\d+)?$/.test(rhsRaw)) { rhs = parseFloat(rhsRaw); }
                else if (/^[a-zA-Z_$][\w.$]*$/.test(rhsRaw)) { rhs = utils.getNested(data, rhsRaw); }
                else { return false; }
                switch (op) {
                    case '===': return lhs === rhs;
                    case '!==': return lhs !== rhs;
                    case '==':  return lhs == rhs;
                    case '!=':  return lhs != rhs;
                    case '>=':  return lhs >= rhs;
                    case '<=':  return lhs <= rhs;
                    case '>':   return lhs > rhs;
                    case '<':   return lhs < rhs;
                    default:    return false;
                }
            }
            if (/^[a-zA-Z_$][\w.$]*$/.test(expr)) return !!utils.getNested(data, expr);
            return false;
        },

        // ============================================================
        // 栈式模板解析器
        // ============================================================
        parseTemplate: function(template, data, onceCache, pendingPromises) {
            if (!template) return '';
            onceCache = onceCache || {};
            pendingPromises = pendingPromises || null;
            template = utils.stripComments(template);
            var pos = 0, len = template.length, result = '';
            while (pos < len) {
                var openIdx = template.indexOf('{{', pos);
                if (openIdx === -1) { result += template.slice(pos); break; }
                result += template.slice(pos, openIdx);
                var closeIdx = utils._findClosingBraces(template, openIdx + 2);
                if (closeIdx === -1) { result += template.slice(openIdx); break; }
                var tag = template.slice(openIdx + 2, closeIdx).trim();
                pos = closeIdx + 2;

                // #if
                if (tag.indexOf('#if ') === 0 || tag === '#if') {
                    var ifCond = tag.indexOf('#if ') === 0 ? tag.slice(4).trim() : '';
                    var inner = utils._extractBlock(template, pos, '#if', '/if');
                    pos = inner.nextPos;
                    var rendered = '';
                    if (ifCond) {
                        var branches = utils._splitIfBranches(inner.content);
                        for (var bi = 0; bi < branches.length; bi++) {
                            if (branches[bi].condition === null || utils.evalCondition(branches[bi].condition, data)) {
                                rendered = utils.parseTemplate(branches[bi].content, data, onceCache, pendingPromises);
                                break;
                            }
                        }
                    } else {
                        rendered = utils.parseTemplate(inner.content, data, onceCache, pendingPromises);
                    }
                    result += rendered;
                    continue;
                }
                // #for
                if (tag.indexOf('#for ') === 0) {
                    var forExpr = tag.slice(5).trim();
                    var forMatch = forExpr.match(/^(\w+)\s+of\s+([\w.]+)(?:\s+key\s*=\s*"([^"]*)")?\s*$/);
                    var forInner = utils._extractBlock(template, pos, '#for', '/for');
                    pos = forInner.nextPos;
                    if (forMatch) {
                        var items = utils.getNested(data, forMatch[2]);
                        var itemName = forMatch[1];
                        var trackKey = forMatch[3] || null;
                        if (utils.isArray(items) && items.length > 0) {
                            for (var fi = 0; fi < items.length; fi++) {
                                var listItem = items[fi];
                                var ctx = {};
                                for (var dk in data) { if (data.hasOwnProperty(dk)) ctx[dk] = data[dk]; }
                                ctx.index = fi; ctx.parent = data; ctx[itemName] = listItem;
                                var keyVal = '__idx_' + fi;
                                if (trackKey) { var k = utils.getNested(listItem, trackKey); if (k !== undefined) keyVal = k; }
                                ctx['@key'] = keyVal;
                                var itemRendered = utils.parseTemplate(forInner.content, ctx, onceCache, pendingPromises);
                                result += '<shadowit-key data-key="' + keyVal + '">' + itemRendered + '</shadowit-key>';
                            }
                        }
                    }
                    continue;
                }
                // #show
                if (tag.indexOf('#show ') === 0) {
                    var showExpr = tag.slice(6).trim();
                    var showVal = utils.evalCondition(showExpr, data);
                    var showInner = utils._extractBlock(template, pos, '#show', '/show');
                    pos = showInner.nextPos;
                    var showContent = utils.parseTemplate(showInner.content, data, onceCache, pendingPromises);
                    result += showVal ? showContent : '<shadowit-key style="display:none">' + showContent + '</shadowit-key>';
                    continue;
                }
                // #once
                if (tag === '#once') {
                    var onceKey = 'once_' + openIdx;
                    var onceInner = utils._extractBlock(template, pos, '#once', '/once');
                    pos = onceInner.nextPos;
                    if (onceCache[onceKey]) { result += onceCache[onceKey]; }
                    else {
                        var onceRendered = utils.parseTemplate(onceInner.content, data, onceCache, pendingPromises);
                        onceCache[onceKey] = onceRendered;
                        result += onceRendered;
                    }
                    continue;
                }
                // #await
                if (tag.indexOf('#await ') === 0) {
                    var awaitExpr = tag.slice(7).trim();
                    var awaitInner = utils._extractBlock(template, pos, '#await', '/await');
                    pos = awaitInner.nextPos;
                    var awaitParts = utils._splitAwaitBranches(awaitInner.content);
                    var awaitVal = utils.getNested(data, awaitExpr);
                    if (awaitVal && typeof awaitVal.then === 'function') {
                        // 是 Promise：渲染 loading 状态，注册回调
                        result += utils.parseTemplate(awaitParts.loading, data, onceCache, pendingPromises);
                        if (pendingPromises) {
                            pendingPromises.push({
                                promise: awaitVal,
                                thenContent: awaitParts.then,
                                thenVar: awaitParts.thenVar,
                                catchContent: awaitParts.catch,
                                catchVar: awaitParts.catchVar
                            });
                        }
                    } else if (awaitVal !== undefined && awaitVal !== null) {
                        // 已解析：渲染 then 分支
                        var thenCtx = {};
                        for (var tdk in data) { if (data.hasOwnProperty(tdk)) thenCtx[tdk] = data[tdk]; }
                        if (awaitParts.thenVar) thenCtx[awaitParts.thenVar] = awaitVal;
                        result += utils.parseTemplate(awaitParts.then, thenCtx, onceCache, pendingPromises);
                    } else {
                        result += utils.parseTemplate(awaitParts.loading, data, onceCache, pendingPromises);
                    }
                    continue;
                }
                // #portal
                if (tag.indexOf('#portal') === 0) {
                    var portalSelectorMatch = tag.match(/^#portal\s+selector\s*=\s*"([^"]*)"$/);
                    var portalInner = utils._extractBlock(template, pos, '#portal', '/portal');
                    pos = portalInner.nextPos;
                    var portalContent = utils.parseTemplate(portalInner.content, data, onceCache, pendingPromises);
                    if (portalSelectorMatch) {
                        result += '<shadowit-portal data-selector="' + utils.escapeHtml(portalSelectorMatch[1]) + '">' + portalContent + '</shadowit-portal>';
                    }
                    continue;
                }
                // 普通插值
                if (/^[a-zA-Z_$][\w.$]*$/.test(tag)) {
                    var value = utils.getNested(data, tag);
                    result += value !== undefined && value !== null ? utils.escapeHtml(value) : '';
                } else if (/^\.\.\//.test(tag)) {
                    var parts = tag.split('/'), levels = 0, path = '';
                    for (var pi = 0; pi < parts.length; pi++) {
                        if (parts[pi] === '..') levels++; else { path = parts[pi]; break; }
                    }
                    var parentData = utils.getParentData(data, levels);
                    if (parentData) {
                        var pval = utils.getNested(parentData, path);
                        result += pval !== undefined && pval !== null ? utils.escapeHtml(pval) : '';
                    }
                }
            }
            return result;
        },

        _extractBlock: function(template, startPos, blockType, closeType) {
            var depth = 1, pos = startPos, len = template.length;
            var openTag = '{{#' + blockType, closeTag = '{{/' + closeType + '}}';
            while (pos < len && depth > 0) {
                var nextOpen = template.indexOf(openTag, pos);
                var nextClose = template.indexOf(closeTag, pos);
                if (nextClose === -1) return { content: template.slice(startPos), nextPos: len };
                if (nextOpen > -1 && nextOpen < nextClose) { depth++; pos = nextOpen + openTag.length; }
                else {
                    depth--;
                    if (depth === 0) return { content: template.slice(startPos, nextClose), nextPos: nextClose + closeTag.length };
                    pos = nextClose + closeTag.length;
                }
            }
            return { content: template.slice(startPos), nextPos: len };
        },

        _splitIfBranches: function(content) {
            var markers = [], regex = /\{\{#else\s*(?:if\s*\(?\s*([^})]+)\s*\)?)?\}\}/g, match;
            while ((match = regex.exec(content)) !== null) {
                markers.push({ index: match.index, endIndex: match.index + match[0].length, condition: match[1] ? match[1].trim() : null });
            }
            if (markers.length === 0) return [{ condition: null, content: content }];
            var branches = [{ condition: null, content: content.substring(0, markers[0].index) }];
            for (var i = 0; i < markers.length; i++) {
                var start = markers[i].endIndex;
                var end = i < markers.length - 1 ? markers[i + 1].index : content.length;
                branches.push({ condition: markers[i].condition, content: content.substring(start, end) });
            }
            return branches;
        },

        getParentData: function(data, levels) {
            var result = data;
            for (var i = 0; i < levels; i++) {
                if (result && result.parent) result = result.parent; else return undefined;
            }
            return result;
        },

        // 设置嵌套属性值（用于 @bind 双向绑定回写）
        // 路径中间若为 null/undefined 或非对象，则停止，避免覆盖数据
        _setNested: function(obj, path, value) {
            if (!obj || !path) return;
            var keys = path.split('.');
            var last = keys.pop();
            var target = obj;
            for (var i = 0; i < keys.length; i++) {
                var cur = target[keys[i]];
                if (cur === null || cur === undefined) {
                    // 中间路径不存在，创建空对象继续
                    target[keys[i]] = {};
                } else if (!utils.isObject(cur)) {
                    // 中间路径是原始值（字符串、数字等），不予覆盖，停止写入
                    console.warn('[shadowit] @bind 路径 "' + path + '" 在 "' + keys[i] + '" 处不是对象，无法写入。');
                    return;
                }
                target = target[keys[i]];
            }
            target[last] = value;
        },

        // 分割 #await 分支：{{:then varname}}...{{:catch varname}}...{{:loading}}...
        // 或 {{:then}}...{{/await}}
        _splitAwaitBranches: function(content) {
            var result = { loading: '', then: '', thenVar: null, catch: '', catchVar: null };
            // 匹配 :then、:catch、:loading 分支标记
            var branchRe = /\{\{:(then|catch|loading)(?:\s+(\w+))?\}\}/g;
            var markers = [];
            var match;
            while ((match = branchRe.exec(content)) !== null) {
                markers.push({
                    index: match.index,
                    endIndex: match.index + match[0].length,
                    type: match[1],
                    varName: match[2] || null
                });
            }
            if (markers.length === 0) {
                // 无分支标记：全部视为 loading 内容
                result.loading = content;
                return result;
            }
            // 第一个 marker 之前的内容是 loading
            result.loading = content.substring(0, markers[0].index);
            for (var i = 0; i < markers.length; i++) {
                var start = markers[i].endIndex;
                var end = i < markers.length - 1 ? markers[i + 1].index : content.length;
                var branchContent = content.substring(start, end);
                if (markers[i].type === 'then') {
                    result.then = branchContent;
                    result.thenVar = markers[i].varName;
                } else if (markers[i].type === 'catch') {
                    result.catch = branchContent;
                    result.catchVar = markers[i].varName;
                } else if (markers[i].type === 'loading') {
                    result.loading = branchContent;
                }
            }
            return result;
        },

        renderTemplate: function(template, data, onceCache, pendingPromises) {
            if (!template) return '';
            return utils.parseTemplate(template, data, onceCache, pendingPromises);
        },

        // 解析事件表达式: @click="handler(arg1, arg2)"
        parseEventExpr: function(expr) {
            var match = expr.match(/^(\w+)\(([^)]*)\)$/);
            if (match) {
                var args = match[2].split(',').map(function(s) {
                    s = s.trim();
                    if ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') ||
                        (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'")) {
                        return s.slice(1, -1);
                    }
                    if (s === 'true') return true;
                    if (s === 'false') return false;
                    if (s === 'null') return null;
                    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
                    return { $path: s };
                });
                return { name: match[1], args: args };
            }
            return { name: expr, args: [] };
        }
    };

    // ============================================================
    // 事件委托管理器（在 _root 上统一监听，永不重建）
    // ============================================================
    function DelegatedEventManager(root, dataFn, methodsFn, bindCallback) {
        this._root = root;
        this._dataFn = dataFn;
        this._methodsFn = methodsFn;
        this._bindCallback = bindCallback || null;
        this._listeners = {};   // { eventType: boundFn }
        this._handlers = {};    // { eventType: [{ selector, handlerName, parsedArgs }] }
        this._boundNodes = new WeakSet();  // 增量绑定：标记已扫描节点
        this._bindings = [];    // @bind 绑定列表
    }

    DelegatedEventManager.prototype.scan = function(newNodes) {
        if (!this._root) return this;

        // 保留已存在元素的处理器（它们已移除 @click 属性，但 __sdit_events 标记仍在）
        var newHandlers = {};
        for (var et in this._handlers) {
            if (this._handlers.hasOwnProperty(et)) {
                var existing = this._handlers[et];
                for (var hi = 0; hi < existing.length; hi++) {
                    var h = existing[hi];
                    if (h.element && h.element.isConnected && h.element.__sdit_events && h.element.__sdit_events[et]) {
                        if (!newHandlers[et]) newHandlers[et] = [];
                        newHandlers[et].push(h);
                    }
                }
            }
        }

        // 保留仍然连接的 @bind 绑定
        var newBindings = [];
        var self = this;
        for (var bi = 0; bi < this._bindings.length; bi++) {
            if (this._bindings[bi].el && this._bindings[bi].el.isConnected) {
                newBindings.push(this._bindings[bi]);
            }
        }

        // 增量扫描：如果有 newNodes，只扫描新节点；否则全量扫描
        var nodesToScan;
        if (newNodes && newNodes.length > 0) {
            nodesToScan = newNodes;
        } else {
            // 全量扫描（首次渲染）
            nodesToScan = this._root.querySelectorAll('*');
        }

        for (var i = 0; i < nodesToScan.length; i++) {
            var el = nodesToScan[i];
            // WeakSet 去重：已扫描过的节点跳过
            if (this._boundNodes.has(el)) continue;
            this._boundNodes.add(el);

            var attrs = el.getAttributeNames ? el.getAttributeNames() : [];
            for (var j = 0; j < attrs.length; j++) {
                var name = attrs[j];
                if (name.charAt(0) === '@' && name !== '@key') {
                    var attrValue = el.getAttribute(name);
                    el.removeAttribute(name);

                    // @bind 双向绑定：特殊处理
                    if (name === '@bind' && attrValue && this._bindCallback) {
                        if (!el.__sdit_events) el.__sdit_events = {};
                        el.__sdit_events['__bind__'] = true;
                        var bindPath = attrValue;
                        // 设置初始值
                        var data = this._dataFn ? this._dataFn() : {};
                        var initVal = utils.getNested(data, bindPath);
                        if (initVal !== undefined && initVal !== null) {
                            if (el.type === 'checkbox') {
                                el.checked = !!initVal;
                            } else {
                                el.value = String(initVal);
                            }
                        }
                        var bindHandler = (function(path, elem) {
                            return function(e) {
                                var val;
                                if (elem.type === 'checkbox') val = elem.checked;
                                else val = elem.value;
                                self._bindCallback(path, val);
                            };
                        })(bindPath, el);
                        el.addEventListener('input', bindHandler);
                        el.addEventListener('change', bindHandler);
                        newBindings.push({ el: el, path: bindPath, handler: bindHandler });
                        continue;
                    }

                    // 普通事件委托 @click, @submit 等
                    if (attrValue) {
                        var eventType = name.slice(1);
                        if (!newHandlers[eventType]) newHandlers[eventType] = [];
                        if (!el.__sdit_events) el.__sdit_events = {};
                        if (el.__sdit_events[eventType]) continue;
                        el.__sdit_events[eventType] = true;
                        var parsed = utils.parseEventExpr(attrValue);
                        newHandlers[eventType].push({
                            element: el,
                            handlerName: parsed.name,
                            parsedArgs: parsed.args
                        });
                    }
                }
            }
        }
        this._handlers = newHandlers;
        this._bindings = newBindings;
        this._ensureListeners();
        return this;
    };

    DelegatedEventManager.prototype._ensureListeners = function() {
        var self = this;
        // 移除不再需要的监听器
        for (var et in this._listeners) {
            if (this._listeners.hasOwnProperty(et) && !this._handlers[et]) {
                this._root.removeEventListener(et, this._listeners[et]);
                delete this._listeners[et];
            }
        }
        // 添加新的监听器
        for (var eventType in this._handlers) {
            if (this._handlers.hasOwnProperty(eventType) && !this._listeners[eventType]) {
                var boundFn = (function(et) {
                    return function(e) {
                        var target = e.target;
                        while (target && target !== self._root) {
                            if (target.__sdit_events && target.__sdit_events[et]) {
                                var handlers = self._handlers[et];
                                for (var hi = 0; hi < handlers.length; hi++) {
                                    if (handlers[hi].element === target) {
                                        self._invokeHandler(handlers[hi], e, target);
                                        break;
                                    }
                                }
                            }
                            target = target.parentNode;
                        }
                    };
                })(eventType);
                this._listeners[eventType] = boundFn;
                this._root.addEventListener(eventType, boundFn);
            }
        }
    };

    DelegatedEventManager.prototype._invokeHandler = function(h, e, el) {
        var data = this._dataFn ? this._dataFn() : {};
        var methods = this._methodsFn ? this._methodsFn() : {};
        var fn = utils.isFunction(data[h.handlerName]) ? data[h.handlerName] :
            (utils.isFunction(methods[h.handlerName]) ? methods[h.handlerName] : null);
        if (!fn) return;

        var resolvedArgs = [];
        for (var i = 0; i < h.parsedArgs.length; i++) {
            var arg = h.parsedArgs[i];
            if (arg && typeof arg === 'object' && arg.$path) {
                var val = utils.getNested(data, arg.$path);
                resolvedArgs.push(val !== undefined ? val : arg.$path);
            } else {
                resolvedArgs.push(arg);
            }
        }
        fn.apply(el, [e, el].concat(resolvedArgs));
    };

    DelegatedEventManager.prototype.destroy = function() {
        for (var et in this._listeners) {
            if (this._listeners.hasOwnProperty(et)) {
                this._root.removeEventListener(et, this._listeners[et]);
            }
        }
        // 清理 @bind 绑定
        for (var i = 0; i < this._bindings.length; i++) {
            var b = this._bindings[i];
            if (b.el && b.handler) {
                b.el.removeEventListener('input', b.handler);
                b.el.removeEventListener('change', b.handler);
            }
        }
        this._listeners = {};
        this._handlers = {};
        this._bindings = [];
        this._root = null;
    };

    // ============================================================
    // ShadowIt 核心类
    // ============================================================
    function ShadowIt(host, options) {
        if (!isSupported()) {
            console.warn('[shadowit] 当前浏览器不支持 Shadow DOM 或 Custom Elements，请加载 polyfill。');
        }
        options = options || {};
        var cssVal = options.css || options.styles || '';

        this.options = {
            template: options.template || '',
            css: cssVal,
            data: options.data || {},
            mode: options.mode || 'open',
            lifecycle: options.lifecycle || {},
            onError: options.onError || null,
            eventsOnHost: options.eventsOnHost || false,
            name: options.name || null,
            methods: options.methods || {},
            computed: options.computed || {},
            reactive: options.reactive !== false  // 默认开启 Proxy 响应式
        };

        this._id = utils.uid();
        this._data = utils.deepClone(this.options.data);
        this._rendered = false;
        this._destroyed = false;
        this._mounted = false;
        this._pendingSelector = null;
        this._queryCache = new Map();
        this._onceCache = {};
        this._updating = false;
        this._updateScheduled = false;   // requestAnimationFrame 批处理标记
        this._pendingPromises = [];       // #await 待处理 Promise

        this._host = null;
        this._root = null;
        this._lastHtml = '';
        this._delegatedEvents = null;
        this._groupInstances = [];  // 多宿主组实例（sdit([...]) 时追踪）

        this._lifecycle = {
            beforeRender: this.options.lifecycle.beforeRender || null,
            afterRender: this.options.lifecycle.afterRender || null,
            beforeUpdate: this.options.lifecycle.beforeUpdate || null,
            afterUpdate: this.options.lifecycle.afterUpdate || null,
            shouldUpdate: this.options.lifecycle.shouldUpdate || null,
            destroy: this.options.lifecycle.destroy || null
        };

        this._name = this.options.name;
        if (this._name && typeof this._name === 'string') {
            if (shadowit._nameMap[this._name]) {
                console.warn('[shadowit] 实例名称 "' + this._name + '" 已存在，将被覆盖。');
            }
            shadowit._nameMap[this._name] = this;
        }

        if (host) { this.mount(host); }
    }

    ShadowIt._rootSeed = 0;

    ShadowIt.prototype._mountOne = function(hostEl) {
        if (!hostEl) throw new Error('[shadowit] 宿主元素未找到');
        this._host = hostEl;
        this._root = this._host.attachShadow({ mode: this.options.mode });
        this._mounted = true;
        shadowit._instances.set(this._host, this);

        // 自动 template：如果 template 为空，取宿主子元素作为模板
        var tpl = this.options.template;
        if (!tpl || (utils.isString(tpl) && tpl.trim() === '')) {
            var hostHTML = this._host.innerHTML;
            if (hostHTML && hostHTML.trim()) {
                this.options.template = hostHTML;
                this._host.innerHTML = '';
            }
        }

        var self = this;
        var eventRoot = this.options.eventsOnHost ? this._host : this._root;
        this._delegatedEvents = new DelegatedEventManager(
            eventRoot,
            function() { return self._data; },
            function() { return self.options.methods; },
            function(path, value) {
                utils._setNested(self._data, path, value);
                self.update();
            }
        );

        if (this.options.reactive && typeof Proxy !== 'undefined') {
            this._makeReactive();
        }

        this._applyCSS();
        this.render();
        return this;
    };

    ShadowIt.prototype.mount = function(host) {
        if (this._destroyed) throw new Error('[shadowit] 实例已销毁，无法挂载');

        // 支持数组：sdit(...).mount([el1, el2, ...])
        if (utils.isArray(host) || (host && typeof host.length === 'number' && host.item)) {
            var hosts = shadowit._resolveHosts(host);
            if (hosts.length === 0) throw new Error('[shadowit] mount() 未找到任何有效宿主元素');
            // 第一个宿主用当前实例挂载
            var firstHost = hosts[0];
            if (this._mounted) {
                // 已有旧宿主，先 detach
                this._detachFromHost();
            }
            this._mountOne(firstHost);
            // 剩余宿主创建新实例并加入组（共享当前 template/css/data）
            if (!this._groupInstances) this._groupInstances = [];
            for (var i = 1; i < hosts.length; i++) {
                var clone = new ShadowIt(hosts[i], {
                    template: this.options.template,
                    css: this.options.css,
                    data: utils.deepClone(this._data),
                    mode: this.options.mode,
                    lifecycle: this.options.lifecycle,
                    onError: this.options.onError,
                    eventsOnHost: this.options.eventsOnHost,
                    methods: this.options.methods,
                    computed: this.options.computed,
                    reactive: this.options.reactive
                });
                this._groupInstances.push(clone);
            }
            return this;
        }

        if (!host) throw new Error('[shadowit] mount() 需要指定宿主元素');

        // 单个 host，支持选择器字符串
        var hostEl = utils.isString(host) ? document.querySelector(host) : host;
        if (!hostEl) throw new Error('[shadowit] 宿主元素未找到: ' + host);

        if (this._mounted) {
            // 重复挂载：先 detach 旧宿主
            this._detachFromHost();
        }

        this._mountOne(hostEl);
        return this;
    };

    // 从旧宿主 detach（保留数据和配置，不销毁实例）
    ShadowIt.prototype._detachFromHost = function() {
        if (this._delegatedEvents) { this._delegatedEvents.destroy(); this._delegatedEvents = null; }
        if (this._root) { this._root.innerHTML = ''; this._root = null; }
        if (this._host) { shadowit._instances.delete(this._host); this._host = null; }
        this._mounted = false;
        this._rendered = false;
        this._lastHtml = '';
        this._queryCache.clear();
        this._onceCache = {};
        this._updateScheduled = false;
    };

    // 卸载实例（与 mount 相反，保留数据和配置，可重新挂载）
    ShadowIt.prototype.unmount = function() {
        if (this._destroyed) return this;
        // 先卸载组内所有实例
        if (this._groupInstances && this._groupInstances.length > 0) {
            for (var i = 0; i < this._groupInstances.length; i++) {
                if (this._groupInstances[i] && !this._groupInstances[i]._destroyed) {
                    this._groupInstances[i]._detachFromHost();
                }
            }
            this._groupInstances = [];
        }
        if (this._mounted) this._detachFromHost();
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

    ShadowIt.prototype.styles = function(cssStr) { return this.css(cssStr); };

    ShadowIt.prototype.data = function(newData) {
        if (this._destroyed) return this;
        if (utils.isObject(newData)) utils.merge(this._data, newData);
        return this;
    };

    ShadowIt.prototype.setData = function(newData) {
        if (this._destroyed) return this;
        if (utils.isObject(newData)) {
            this._data = utils.deepClone(newData);
            // 重新包装 Proxy（如果响应式已启用）
            if (this.options.reactive && typeof Proxy !== 'undefined') {
                this._makeReactive();
            }
        }
        return this;
    };

    ShadowIt.prototype.getData = function() { return utils.deepClone(this._data); };

    // ----- 渲染与更新 -----
    ShadowIt.prototype._renderToHtml = function() {
        var html = this.options.template || '';
        if (utils.isFunction(html)) html = html(this._data);
        if (utils.isString(html)) html = utils.renderTemplate(html, this._data, this._onceCache, this._pendingPromises);
        return html;
    };

    ShadowIt.prototype.render = function() {
        if (this._destroyed) throw new Error('[shadowit] 实例已销毁');
        if (!this._mounted) throw new Error('[shadowit] 实例尚未挂载');
        return this.update(null);
    };

    ShadowIt.prototype.update = function(newData) {
        if (this._destroyed) {
            console.warn('[shadowit] 实例已销毁，无法更新');
            return this;
        }
        if (this._updating) {
            if (utils.isObject(newData)) utils.merge(this._data, newData);
            return this;
        }
        if (!this._mounted) {
            if (utils.isObject(newData)) utils.merge(this._data, newData);
            return this;
        }

        this._updating = true;
        this._updateScheduled = false;
        var isFirstRender = !this._rendered;
        var oldData = isFirstRender ? null : utils.deepClone(this._data);
        try {
            if (isFirstRender) {
                this._callHook('beforeRender');
            } else {
                this._callHook('beforeUpdate', newData, oldData);
            }

            if (utils.isObject(newData)) utils.merge(this._data, newData);

            // shouldUpdate 钩子：数据合并后调用，允许开发者根据最终状态判断是否跳过渲染
            if (!isFirstRender && utils.isFunction(this._lifecycle.shouldUpdate)) {
                if (!this._lifecycle.shouldUpdate.call(this, newData, this._data)) {
                    this._updating = false;
                    return this;
                }
            }

            // 计算 computed 属性
            this._evalComputed();

            // 收集 #await 待处理的 Promise
            this._pendingPromises = [];
            var html = this._renderToHtml();
            if (html === this._lastHtml && !isFirstRender && this._pendingPromises.length === 0) {
                this._updating = false;
                return this;
            }

            var newNodes = [];
            if (isFirstRender) {
                this._root.innerHTML = html;
            } else {
                newNodes = this._keyedDiff(this._root, html);
            }
            this._rendered = true;
            this._lastHtml = html;

            // 增量事件绑定：仅扫描新节点
            this._delegatedEvents.scan(newNodes.length > 0 ? newNodes : null);
            this._queryCache.clear();
            if (shadowit._cacheEnabled) shadowit.clearQueryCache();

            // 处理 #portal 传送门
            this._handlePortals();

            // 处理 #await Promise 回调
            this._resolvePendingPromises();

            if (isFirstRender) this._callHook('afterRender', this._data);
            else this._callHook('afterUpdate', newData, this._data);
        } catch (err) {
            this._handleError(err, isFirstRender ? 'render' : 'update');
        }
        this._updating = false;
        return this;
    };

    // ============================================================
    // Keyed Diff — 两阶段键控 Diff + 位置移动检测
    // 阶段一：处理 keyed 节点（移除/复用/移动）
    // 阶段二：处理非 keyed 段落（标签感知 diff）
    // ============================================================
    ShadowIt.prototype._keyedDiff = function(parent, newHtml) {
        var temp = document.createElement('div');
        temp.innerHTML = newHtml;

        var oldChildren = Array.from(parent.childNodes);
        var newChildren = Array.from(temp.childNodes);
        var oldLen = oldChildren.length, newLen = newChildren.length;
        var newNodes = [];  // 收集新增节点，供增量事件绑定使用

        // ---- 收集旧的 keyed 节点 ----
        var oldKeyMap = new Map();   // key -> node
        var oldKeyList = [];          // [{ key, node, index }]
        for (var oi = 0; oi < oldLen; oi++) {
            var oc = oldChildren[oi];
            if (oc.nodeType === 1 && oc.tagName === 'SHADOWIT-KEY') {
                var key = oc.getAttribute('data-key');
                oldKeyMap.set(key, oc);
                oldKeyList.push({ key: key, node: oc, index: oi });
            }
        }

        // ---- 收集新的 keyed 节点 ----
        var newKeySpecs = [];         // [{ key, node, index }]
        var newKeyMap = new Map();    // key -> spec
        for (var ni = 0; ni < newLen; ni++) {
            var nc = newChildren[ni];
            if (nc.nodeType === 1 && nc.tagName === 'SHADOWIT-KEY') {
                var spec = { key: nc.getAttribute('data-key'), node: nc, index: ni };
                newKeySpecs.push(spec);
                newKeyMap.set(spec.key, spec);
            }
        }

        // ---- 分治：有 keyed 节点的情况 ----
        if (newKeySpecs.length > 0 || oldKeyList.length > 0) {
            // 阶段一：移除旧的不再需要的 keyed 节点
            for (var oki = 0; oki < oldKeyList.length; oki++) {
                if (!newKeyMap.has(oldKeyList[oki].key)) {
                    parent.removeChild(oldKeyList[oki].node);
                }
            }

            // 阶段一续：按新顺序构建最终子节点列表
            var newChildList = [];

            for (var nni = 0; nni < newLen; nni++) {
                var nchild = newChildren[nni];
                if (nchild.nodeType === 1 && nchild.tagName === 'SHADOWIT-KEY') {
                    var nkey = nchild.getAttribute('data-key');
                    var oldNode = oldKeyMap.get(nkey);
                    if (oldNode) {
                        var oldInner = oldNode.innerHTML;
                        var newInner = nchild.innerHTML;
                        if (oldInner !== newInner) {
                            oldNode.innerHTML = newInner;
                            // 收集新插入的子节点（innerHTML 更新产生的）
                            var innerChildren = oldNode.querySelectorAll('*');
                            for (var ici = 0; ici < innerChildren.length; ici++) {
                                newNodes.push(innerChildren[ici]);
                            }
                        }
                        newChildList.push(oldNode);
                    } else {
                        // 新 key，创建
                        var cloned = nchild.cloneNode(true);
                        newChildList.push(cloned);
                        // 收集新节点及其子树
                        newNodes.push(cloned);
                        var subNodes = cloned.querySelectorAll('*');
                        for (var sni = 0; sni < subNodes.length; sni++) {
                            newNodes.push(subNodes[sni]);
                        }
                    }
                } else {
                    // 非 keyed 节点：尝试从旧子节点中找对应位置复用
                    var cloned2 = nchild.cloneNode(true);
                    newChildList.push(cloned2);
                    newNodes.push(cloned2);
                    var subNodes2 = cloned2.querySelectorAll('*');
                    for (var sn2 = 0; sn2 < subNodes2.length; sn2++) {
                        newNodes.push(subNodes2[sn2]);
                    }
                }
            }

            // 清空并重建
            while (parent.firstChild) { parent.removeChild(parent.firstChild); }
            for (var li = 0; li < newChildList.length; li++) {
                parent.appendChild(newChildList[li]);
            }
        } else {
            // ---- 无 keyed 节点：标签感知 diff ----
            this._diffChildren(parent, oldChildren, newChildren, newNodes);
        }
        return newNodes;
    };

    // ============================================================
    // 递归子节点 Diff — 保留 DOM 节点状态（input 焦点、video 进度等）
    // ============================================================
    ShadowIt.prototype._diffChildren = function(parent, oldChildren, newChildren, newNodes) {
        var oldLen = oldChildren.length, newLen = newChildren.length;
        var oIdx = 0, nIdx = 0;
        while (oIdx < oldLen && nIdx < newLen) {
            var oc = oldChildren[oIdx], nc = newChildren[nIdx];
            if (oc.nodeType === nc.nodeType && oc.nodeName === nc.nodeName) {
                if (oc.nodeType === 3) {
                    // 文本节点：直接更新内容
                    if (oc.textContent !== nc.textContent) oc.textContent = nc.textContent;
                } else if (oc.nodeType === 1) {
                    // 元素节点：浅层属性 diff
                    var oldAttrs = oc.attributes, newAttrs = nc.attributes;
                    for (var ai = oldAttrs.length - 1; ai >= 0; ai--) {
                        if (!nc.hasAttribute(oldAttrs[ai].name)) {
                            oc.removeAttribute(oldAttrs[ai].name);
                        }
                    }
                    for (var bi = 0; bi < newAttrs.length; bi++) {
                        if (oc.getAttribute(newAttrs[bi].name) !== newAttrs[bi].value) {
                            oc.setAttribute(newAttrs[bi].name, newAttrs[bi].value);
                        }
                    }
                    // 递归 diff 子节点，而不是 innerHTML 替换
                    var oldChildNodes = Array.from(oc.childNodes);
                    var newChildNodes = Array.from(nc.childNodes);
                    this._diffChildren(oc, oldChildNodes, newChildNodes, newNodes);
                }
                oIdx++; nIdx++;
            } else {
                // 向前搜索匹配标签（搜索全局而非仅 6 个）
                var matchIdx = -1;
                for (var si = oIdx + 1; si < oldLen; si++) {
                    if (oldChildren[si].nodeType === nc.nodeType && oldChildren[si].nodeName === nc.nodeName) {
                        matchIdx = si; break;
                    }
                }
                if (matchIdx > -1) {
                    // 移除中间不匹配的节点
                    for (var ri = oIdx; ri < matchIdx; ri++) {
                        parent.removeChild(oldChildren[ri]);
                    }
                    parent.insertBefore(oldChildren[matchIdx], oc || null);
                    // 递归 diff 匹配到的节点
                    if (oldChildren[matchIdx].nodeType === 1) {
                        var oldSub = Array.from(oldChildren[matchIdx].childNodes);
                        var newSub = Array.from(nc.childNodes);
                        this._diffChildren(oldChildren[matchIdx], oldSub, newSub, newNodes);
                    } else if (oldChildren[matchIdx].nodeType === 3 &&
                               oldChildren[matchIdx].textContent !== nc.textContent) {
                        oldChildren[matchIdx].textContent = nc.textContent;
                    }
                    oIdx = matchIdx + 1; nIdx++;
                } else {
                    // 找不到匹配，插入新节点
                    var cloned = nc.cloneNode(true);
                    parent.insertBefore(cloned, oc);
                    parent.removeChild(oc);
                    newNodes.push(cloned);
                    var subNodes = cloned.querySelectorAll('*');
                    for (var sn = 0; sn < subNodes.length; sn++) {
                        newNodes.push(subNodes[sn]);
                    }
                    oIdx++; nIdx++;
                }
            }
        }
        // 移除多余的旧节点
        while (oIdx < oldLen) { parent.removeChild(oldChildren[oIdx]); oIdx++; }
        // 追加新节点
        while (nIdx < newLen) {
            var cloned4 = newChildren[nIdx].cloneNode(true);
            parent.appendChild(cloned4);
            newNodes.push(cloned4);
            var subN4 = cloned4.querySelectorAll('*');
            for (var sn4 = 0; sn4 < subN4.length; sn4++) newNodes.push(subN4[sn4]);
            nIdx++;
        }
    };

    // ----- 生命周期 -----
    ShadowIt.prototype._callHook = function(name) {
        var args = Array.prototype.slice.call(arguments, 1);
        var hook = this._lifecycle[name];
        if (utils.isFunction(hook)) {
            try { hook.apply(this, args); }
            catch (err) { this._handleError(err, 'lifecycle.' + name); }
        }
    };

    // ----- computed 计算属性 -----
    ShadowIt.prototype._evalComputed = function() {
        var computed = this.options.computed;
        if (!utils.isObject(computed)) return;
        for (var key in computed) {
            if (computed.hasOwnProperty(key)) {
                try {
                    this._data[key] = computed[key].call(this, this._data);
                } catch (err) {
                    this._handleError(err, 'computed.' + key);
                }
            }
        }
    };

    // ----- #portal 传送门处理 -----
    ShadowIt.prototype._handlePortals = function() {
        if (!this._root) return;
        var portals = this._root.querySelectorAll('shadowit-portal');
        if (portals.length === 0) return;
        // 初始化 portal 节点追踪数组
        if (!this._portalNodes) this._portalNodes = [];
        for (var i = 0; i < portals.length; i++) {
            var portal = portals[i];
            var selector = portal.getAttribute('data-selector');
            if (!selector) continue;
            try {
                var target = document.querySelector(selector);
                if (target) {
                    // 将 portal 内容移动到目标节点，并追踪
                    while (portal.firstChild) {
                        var child = portal.firstChild;
                        target.appendChild(child);
                        this._portalNodes.push(child);
                    }
                    // 移除空的 portal 占位符
                    if (portal.parentNode) portal.parentNode.removeChild(portal);
                }
            } catch (err) {
                this._handleError(err, 'portal: ' + selector);
            }
        }
    };

    // ----- #await Promise 处理 -----
    ShadowIt.prototype._resolvePendingPromises = function() {
        if (!this._pendingPromises || this._pendingPromises.length === 0) return;
        var self = this;
        for (var i = 0; i < this._pendingPromises.length; i++) {
            var item = this._pendingPromises[i];
            (function(p) {
                p.promise.then(function(resolved) {
                    // 将结果写入 data，触发重新渲染
                    var updateData = {};
                    if (p.thenVar) {
                        updateData[p.thenVar] = resolved;
                    }
                    self.update(updateData);
                }).catch(function(err) {
                    self._handleError(err, '#await Promise rejected');
                });
            })(item);
        }
        this._pendingPromises = [];
    };

    // ----- Proxy 深响应式自动更新 -----
    ShadowIt.prototype._makeReactive = function() {
        // 递归代理已有数据
        this._data = this._deepProxy(this._data);
    };

    ShadowIt.prototype._deepProxy = function(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        // 已经代理过的跳过
        if (obj.__sdit_proxy) return obj;
        var self = this;
        var handler = {
            set: function(target, prop, value) {
                var oldVal = target[prop];
                if (value !== null && (typeof value === 'object')) {
                    value = self._deepProxy(value);
                }
                target[prop] = value;
                if (oldVal !== value && self._mounted && !self._destroyed) {
                    self._scheduleUpdate();
                }
                return true;
            },
            deleteProperty: function(target, prop) {
                if (prop in target) {
                    delete target[prop];
                    if (self._mounted && !self._destroyed) {
                        self._scheduleUpdate();
                    }
                }
                return true;
            }
        };
        // 递归代理所有子对象
        for (var key in obj) {
            if (obj.hasOwnProperty(key) && obj[key] !== null && typeof obj[key] === 'object') {
                obj[key] = self._deepProxy(obj[key]);
            }
        }
        var proxy = new Proxy(obj, handler);
        // 标记已代理（避免循环引用和重复代理）
        Object.defineProperty(proxy, '__sdit_proxy', { value: true, enumerable: false, configurable: true });
        return proxy;
    };

    ShadowIt.prototype._scheduleUpdate = function() {
        if (this._updateScheduled || this._updating) return;
        this._updateScheduled = true;
        var self = this;
        requestAnimationFrame(function() {
            if (self._updateScheduled) {
                self.update();
            }
        });
    };

    ShadowIt.prototype._handleError = function(err, context) {
        try {
            var msg = err && err.message ? err.message : String(err);
            var stack = err && err.stack ? err.stack : '(no stack)';
            console.error('[shadowit] 错误发生在 ' + context + ': ' + msg + '\n' + stack);
            if (utils.isFunction(this.options.onError)) {
                this.options.onError(err, context);
            }
        } catch (e) {
            // 保底：onError 本身崩溃也不影响实例状态
            console.error('[shadowit] onError 自身执行失败:', e && e.message ? e.message : e);
        }
    };

    ShadowIt.prototype._applyCSS = function() {
        if (!this._root) return this;
        var oldStyles = this._root.querySelectorAll('style[data-shadowit]');
        for (var i = 0; i < oldStyles.length; i++) oldStyles[i].remove();
        var cssVal = this.options.css;
        // 支持 css 为函数: css: (data) => '...'，实现动态样式
        if (utils.isFunction(cssVal)) cssVal = cssVal(this._data);
        if (cssVal) {
            var styleEl = document.createElement('style');
            styleEl.setAttribute('data-shadowit', this._id);
            styleEl.textContent = cssVal;
            this._root.prepend(styleEl);
        }
        return this;
    };

    ShadowIt.prototype._startObserver = function() {
        if (!this._pendingSelector) return this;
        var self = this;
        var selector = this._pendingSelector;
        var existing = document.querySelector(selector);
        if (existing) { this._pendingSelector = null; this.mount(existing); return this; }
        var observer = new MutationObserver(function() {
            var el = document.querySelector(selector);
            if (el) {
                observer.disconnect();
                self._pendingSelector = null;
                try { self.mount(el); }
                catch (err) { self._handleError(err, 'auto-mount'); }
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        return this;
    };

    // ----- 事件绑定 -----
    ShadowIt.prototype.on = function(event, selector, handler) {
        if (this._destroyed) return this;
        if (!this._mounted) throw new Error('[shadowit] 实例尚未挂载');
        var target = this._delegatedEvents._root;
        if (!target) throw new Error('[shadowit] 事件目标不可用');
        var wrappedHandler = function(e) {
            var t = e.target;
            while (t && t !== target) {
                if (t.matches && t.matches(selector)) { handler.call(t, e, t); break; }
                t = t.parentNode;
            }
        };
        target.addEventListener(event, wrappedHandler);
        this._delegatedEvents._fallbackHandlers = this._delegatedEvents._fallbackHandlers || [];
        this._delegatedEvents._fallbackHandlers.push({
            event: event, selector: selector,
            handler: handler, wrappedHandler: wrappedHandler
        });
        return this;
    };

    ShadowIt.prototype.off = function(event, selector, handler) {
        if (this._destroyed) return this;
        if (!this._mounted) throw new Error('[shadowit] 实例尚未挂载');
        var target = this._delegatedEvents._root;
        var fallback = this._delegatedEvents._fallbackHandlers || [];
        for (var i = fallback.length - 1; i >= 0; i--) {
            var entry = fallback[i];
            if (entry.event !== event) continue;
            // 精确匹配：selector 和 handler 均可选，层层过滤
            if (selector && entry.selector !== selector) continue;
            if (handler && entry.handler !== handler) continue;
            target.removeEventListener(event, entry.wrappedHandler);
            fallback.splice(i, 1);
        }
        return this;
    };

    // ----- 查询 -----
    ShadowIt.prototype.getRoot = function() { return this._root; };
    ShadowIt.prototype.getHost = function() { return this._host; };
    ShadowIt.prototype.isRendered = function() { return this._rendered; };
    ShadowIt.prototype.isDestroyed = function() { return this._destroyed; };
    ShadowIt.prototype.isMounted = function() { return this._mounted; };

    ShadowIt.prototype.querySelector = function(selector, root) {
        if (!this._mounted) throw new Error('[shadowit] 实例尚未挂载');
        if (root != null) root = utils.resolveRoot(root);
        else root = this._root;
        return root.querySelector(selector);
    };

    ShadowIt.prototype.querySelectorAll = function(selector, root) {
        if (!this._mounted) throw new Error('[shadowit] 实例尚未挂载');
        if (root != null) root = utils.resolveRoot(root);
        else root = this._root;
        return Array.from(root.querySelectorAll(selector));
    };

    ShadowIt.prototype.getName = function() { return this._name; };
    ShadowIt.prototype.getId = function() { return this._id; };

    // 获取多宿主组中的所有实例（含自身）
    ShadowIt.prototype.getGroupInstances = function() {
        var result = [this];
        if (this._groupInstances && this._groupInstances.length > 0) {
            for (var i = 0; i < this._groupInstances.length; i++) {
                if (this._groupInstances[i] && !this._groupInstances[i]._destroyed) {
                    result.push(this._groupInstances[i]);
                }
            }
        }
        return result;
    };

    // ----- 快捷方法 -----
    ShadowIt.prototype.getHTML = function() { return this._root ? this._root.innerHTML : ''; };

    ShadowIt.prototype.getShadowDOM = function() {
        if (!this._mounted || !this._root) return [];
        var results = [];
        var walk = function(node) {
            if (node.nodeType === Node.ELEMENT_NODE && node.shadowRoot) results.push(node);
            if (node.children) for (var i = 0; i < node.children.length; i++) walk(node.children[i]);
        };
        for (var i = 0; i < this._root.children.length; i++) walk(this._root.children[i]);
        return results;
    };

    // ----- qS / qSAll (带缓存 + isConnected 自动失效) -----
    ShadowIt.prototype._rootKey = function(root) {
        if (root === this._root) return '__root__';
        if (!root.__sdit_ck) root.__sdit_ck = 'r' + (++ShadowIt._rootSeed);
        return root.__sdit_ck;
    };

    ShadowIt.prototype.qS = function(selector, root) {
        if (!this._mounted) throw new Error('[shadowit] 实例尚未挂载');
        if (root != null) root = utils.resolveRoot(root);
        else root = this._root;
        if (!root) return null;
        var cacheKey = selector + '|qS|' + this._rootKey(root);
        if (this._queryCache.has(cacheKey)) {
            var cached = this._queryCache.get(cacheKey);
            if (cached && cached.isConnected) return this._wrapResult(cached);
            this._queryCache.delete(cacheKey);
        }
        var result = root.querySelector(selector);
        this._queryCache.set(cacheKey, result);
        return this._wrapResult(result);
    };

    ShadowIt.prototype.qSAll = function(selector, root) {
        if (!this._mounted) throw new Error('[shadowit] 实例尚未挂载');
        if (root != null) root = utils.resolveRoot(root);
        else root = this._root;
        if (!root) return [];
        var cacheKey = selector + '|qSA|' + this._rootKey(root);
        if (this._queryCache.has(cacheKey)) {
            var cached = this._queryCache.get(cacheKey);
            var valid = cached.filter(function(el) { return el && el.isConnected; });
            if (valid.length === cached.length) return valid.map(this._wrapResult.bind(this));
            this._queryCache.delete(cacheKey);
        }
        var result = Array.from(root.querySelectorAll(selector));
        this._queryCache.set(cacheKey, result);
        return result.map(this._wrapResult.bind(this));
    };

    ShadowIt.prototype._wrapResult = function(el) {
        if (!el) return el;
        if (el.__sdit_wrapped) return el;
        var self = this;
        var origRemove = el.remove ? el.remove.bind(el) : function() {
            if (el.parentNode) el.parentNode.removeChild(el);
        };
        el.remove = function() {
            var inst = shadowit._instances.get(el);
            if (inst) inst.destroy();
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

    // ----- destroy -----
    ShadowIt.prototype.destroy = function() {
        if (this._destroyed) return this;
        // 先销毁组内所有实例
        if (this._groupInstances && this._groupInstances.length > 0) {
            for (var gi = 0; gi < this._groupInstances.length; gi++) {
                if (this._groupInstances[gi] && !this._groupInstances[gi]._destroyed) {
                    this._groupInstances[gi].destroy();
                }
            }
            this._groupInstances = null;
        }
        try { this._callHook('destroy'); }
        catch (err) { this._handleError(err, 'destroy'); }
        if (this._delegatedEvents) { this._delegatedEvents.destroy(); this._delegatedEvents = null; }
        if (this._root) { this._root.innerHTML = ''; this._root = null; }
        if (this._host) { shadowit._instances.delete(this._host); }
        if (this._name && shadowit._nameMap[this._name] === this) { delete shadowit._nameMap[this._name]; }
        // 清理 #portal 移出的 DOM 节点
        if (this._portalNodes && this._portalNodes.length > 0) {
            for (var pi = 0; pi < this._portalNodes.length; pi++) {
                var pn = this._portalNodes[pi];
                if (pn && pn.parentNode) pn.parentNode.removeChild(pn);
            }
            this._portalNodes = null;
        }
        this._host = null;
        this._destroyed = true;
        this._mounted = false;
        this._rendered = false;
        return this;
    };

    // ============================================================
    // 全局查询
    // ============================================================
    var _queryCache = new Map(), _cacheEnabled = false;

    function globalQuery(selector, root, all) {
        var cacheKey = selector + '|' + (root === document ? 'document' : (root.id || root.tagName));
        if (_cacheEnabled && _queryCache.has(cacheKey)) {
            var cached = _queryCache.get(cacheKey);
            if (all) {
                var valid = cached.filter(function(el) { return el && el.isConnected; });
                if (valid.length === cached.length) return valid;
            } else {
                if (cached.length > 0 && cached[0] && cached[0].isConnected) return cached[0];
            }
            _queryCache.delete(cacheKey);
        }
        var results = [];
        var stack = [root];
        while (stack.length) {
            var node = stack.pop();
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.matches && node.matches(selector)) {
                    if (!all) { if (_cacheEnabled) _queryCache.set(cacheKey, [node]); return node; }
                    results.push(node);
                }
                if (node.shadowRoot && node.shadowRoot.mode === 'open') stack.push(node.shadowRoot);
                if (node.children) for (var i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
            } else if (node.children) {
                for (var j = node.children.length - 1; j >= 0; j--) stack.push(node.children[j]);
            }
        }
        if (_cacheEnabled) _queryCache.set(cacheKey, results);
        return all ? results : null;
    }

    // ============================================================
    // 批处理更新（带去重）
    // ============================================================
    var _batchMap = new Map(), _batchScheduled = false;

    function flushBatch() {
        var updates = [];
        _batchMap.forEach(function(item) { updates.push(item); });
        _batchMap.clear();
        _batchScheduled = false;
        for (var i = 0; i < updates.length; i++) {
            updates[i].instance.update(updates[i].data);
        }
    }

    // ============================================================
    // 全局 shadowit 函数
    // ============================================================

    // 将混合输入（选择器字符串、Element、NodeList、数组）扁平化为 Element 数组
    shadowit._resolveHosts = function(input) {
        if (!input) return [];
        var results = [];
        function collect(item) {
            if (!item) return;
            if (item instanceof Element) { results.push(item); return; }
            if (utils.isString(item)) {
                try {
                    var els = document.querySelectorAll(item);
                    for (var i = 0; i < els.length; i++) results.push(els[i]);
                } catch (e) {}
                return;
            }
            if (item.length !== undefined && typeof item.length === 'number') {
                for (var j = 0; j < item.length; j++) collect(item[j]);
                return;
            }
        }
        if (utils.isArray(input)) {
            for (var k = 0; k < input.length; k++) collect(input[k]);
        } else {
            collect(input);
        }
        return results;
    };

    function shadowit(host, options) {
        // ---- sdit({}) 纯选项对象（支持 el 属性指定宿主） ----
        if (host && typeof host === 'object' && !(host instanceof Element) && !utils.isArray(host) && !utils.isString(host) && typeof host.length !== 'number') {
            var opts = host;
            var el = opts.el;
            if (el) {
                var hosts = shadowit._resolveHosts(el);
                // 从 options 中移除 el（避免污染 data）
                var cleanOpts = {};
                for (var k in opts) { if (k !== 'el') cleanOpts[k] = opts[k]; }
                if (hosts.length === 0) {
                    var inst = new ShadowIt(null, cleanOpts);
                    if (utils.isString(el)) { inst._pendingSelector = el; inst._startObserver(); }
                    return inst;
                }
                var firstHost = hosts[0];
                var firstInst = new ShadowIt(firstHost, cleanOpts);
                if (hosts.length === 1) return firstInst;
                firstInst._groupInstances = [];
                for (var i = 1; i < hosts.length; i++) {
                    var clone = new ShadowIt(hosts[i], {
                        template: firstInst.options.template,
                        css: firstInst.options.css,
                        data: utils.deepClone(firstInst._data),
                        mode: firstInst.options.mode,
                        lifecycle: firstInst.options.lifecycle,
                        onError: firstInst.options.onError,
                        eventsOnHost: firstInst.options.eventsOnHost,
                        methods: firstInst.options.methods,
                        computed: firstInst.options.computed,
                        reactive: firstInst.options.reactive
                    });
                    firstInst._groupInstances.push(clone);
                }
                return firstInst;
            }
            return new ShadowIt(null, opts);
        }

        // ---- sdit([...]) / sdit([...], {}) 数组多宿主（返回首个实例，带组追踪） ----
        if (utils.isArray(host) || (host && typeof host.length === 'number' && host.item)) {
            var hosts = shadowit._resolveHosts(host);
            if (hosts.length === 0) {
                if (options) return new ShadowIt(null, options);
                return new ShadowIt(null, {});
            }
            var opts = (options && typeof options === 'object' && !(options instanceof Element) && !utils.isString(options)) ? options : {};
            var firstHost = hosts[0];
            var firstInst = new ShadowIt(firstHost, opts);
            if (hosts.length === 1) return firstInst;
            firstInst._groupInstances = [];
            for (var i = 1; i < hosts.length; i++) {
                var clone = new ShadowIt(hosts[i], {
                    template: firstInst.options.template,
                    css: firstInst.options.css,
                    data: utils.deepClone(firstInst._data),
                    mode: firstInst.options.mode,
                    lifecycle: firstInst.options.lifecycle,
                    onError: firstInst.options.onError,
                    eventsOnHost: firstInst.options.eventsOnHost,
                    methods: firstInst.options.methods,
                    computed: firstInst.options.computed,
                    reactive: firstInst.options.reactive
                });
                firstInst._groupInstances.push(clone);
            }
            return firstInst;
        }

        // ---- sdit(el) 单元素无选项 ----
        if (host instanceof Element && arguments.length === 1) {
            return new ShadowIt(host, {});
        }

        // ---- sdit(el, {}) 单元素 + 选项 ----
        if (host instanceof Element && options && typeof options === 'object' && !utils.isString(options)) {
            return new ShadowIt(host, options);
        }

        // ---- 旧版兼容：字符串简写 ----
        if (utils.isString(host) && arguments.length >= 2) {
            var arg1 = arguments[0], arg2 = arguments[1], arg3 = arguments[2];
            if (utils.isCSS(arg2)) {
                var opts2 = { template: arg1, css: arg2 };
                if (arg3) {
                    var h = utils.resolveHost(arg3);
                    if (h) return new ShadowIt(h, opts2);
                    if (utils.isString(arg3)) {
                        var inst = new ShadowIt(null, opts2);
                        inst._pendingSelector = arg3; inst._startObserver(); return inst;
                    }
                }
                return new ShadowIt(null, opts2);
            }
            if (arg2 instanceof Element) return new ShadowIt(arg2, { template: arg1 });
            if (utils.isString(arg2)) {
                var h2 = utils.resolveHost(arg2);
                if (h2) return new ShadowIt(h2, { template: arg1 });
                var inst2 = new ShadowIt(null, { template: arg1 });
                inst2._pendingSelector = arg2; inst2._startObserver(); return inst2;
            }
        }

        // ---- 旧版兼容：options 是字符串/函数 → 当作 template ----
        if (utils.isString(options) || utils.isFunction(options)) options = { template: options };
        if (!options) options = {};

        // ---- sdit('#selector') 选择器字符串 ----
        if (utils.isString(host)) {
            if (!document.querySelector(host)) {
                var inst3 = new ShadowIt(null, options);
                inst3._pendingSelector = host; inst3._startObserver(); return inst3;
            }
            return new ShadowIt(host, options);
        }

        return new ShadowIt(host, options);
    }

    shadowit.version = '1.4.2';
    shadowit.utils = utils;
    shadowit.ShadowIt = ShadowIt;
    shadowit.isSupported = isSupported;

    // ============================================================
    // 实例管理
    // ============================================================
    shadowit._instances = new WeakMap();
    shadowit._nameMap = {};

    shadowit.getInstance = function(name) { return shadowit._nameMap[name] || null; };
    shadowit.unregisterInstance = function(name) {
        if (shadowit._nameMap[name]) delete shadowit._nameMap[name];
        return shadowit;
    };
    shadowit.getInstanceByHost = function(host) { return shadowit._instances.get(host) || null; };

    shadowit.instance = new Proxy({}, {
        get: function(_, prop) {
            return typeof prop === 'string' && prop !== 'length' && prop !== 'constructor' ?
                shadowit._nameMap[prop] : undefined;
        },
        set: function(_, prop, value) {
            if (typeof prop === 'string') shadowit._nameMap[prop] = value;
            return true;
        },
        deleteProperty: function(_, prop) {
            if (typeof prop === 'string') delete shadowit._nameMap[prop];
            return true;
        },
        has: function(_, prop) { return typeof prop === 'string' && shadowit._nameMap.hasOwnProperty(prop); },
        ownKeys: function() { return Object.keys(shadowit._nameMap); },
        getOwnPropertyDescriptor: function(_, prop) {
            if (shadowit._nameMap.hasOwnProperty(prop)) {
                return { enumerable: true, configurable: true, value: shadowit._nameMap[prop] };
            }
            return undefined;
        }
    });

    // 全局查询
    shadowit.querySelector = function(selector, root) { return globalQuery(selector, utils.resolveRoot(root), false); };
    shadowit.querySelectorAll = function(selector, root) { return globalQuery(selector, utils.resolveRoot(root), true) || []; };
    shadowit.enableQueryCache = function(enable) {
        _cacheEnabled = enable !== false;
        if (!_cacheEnabled) _queryCache.clear();
        return shadowit;
    };
    shadowit.clearQueryCache = function() { _queryCache.clear(); return shadowit; };
    shadowit._cacheEnabled = false;

    shadowit.batchUpdate = function(instance, data) {
        _batchMap.set(instance._id || instance, { instance: instance, data: data });
        if (!_batchScheduled) { _batchScheduled = true; requestAnimationFrame(flushBatch); }
        return shadowit;
    };

    // remove / removeAll
    shadowit.remove = function(name, root) {
        root = utils.resolveRoot(root);
        var inst = shadowit._nameMap[name];
        if (inst && inst._host && root.contains(inst._host)) inst.destroy();
        return shadowit;
    };
    shadowit.removeAll = function(root) {
        root = utils.resolveRoot(root);
        var names = Object.keys(shadowit._nameMap);
        for (var i = 0; i < names.length; i++) {
            var inst = shadowit._nameMap[names[i]];
            if (inst && inst.destroy && inst._host && root.contains(inst._host)) inst.destroy();
        }
        return shadowit;
    };

    // scan
    shadowit.scan = function(root) {
        root = utils.resolveRoot(root);
        var walk = function(node) {
            if (node.shadowRoot && node.shadowRoot.mode === 'open') {
                if (!shadowit._instances.has(node)) {
                    var name = node.getAttribute('data-sdit-name') || node.id ||
                        (node.tagName ? node.tagName.toLowerCase() : '') + '-' + Date.now().toString(36);
                    var inst = new ShadowIt(null, { name: name });
                    inst._host = node; inst._root = node.shadowRoot;
                    inst._mounted = true; inst._rendered = true;
                    shadowit._instances.set(node, inst);
                    shadowit._nameMap[name] = inst;
                }
            }
            if (node.children) for (var i = 0; i < node.children.length; i++) walk(node.children[i]);
            if (node.shadowRoot) for (var j = 0; j < node.shadowRoot.children.length; j++) walk(node.shadowRoot.children[j]);
        };
        walk(root);
        return shadowit;
    };

    // copy
    shadowit.copy = function(source, target) {
        var srcEl = utils.resolveHost(source);
        if (!srcEl) return null;
        var wrapper = document.createElement('div');
        wrapper.setAttribute('data-sdit-copy', '');
        var clone = srcEl.cloneNode(true);
        wrapper.appendChild(clone);
        var shadow = wrapper.attachShadow({ mode: 'open' });
        while (wrapper.firstChild) shadow.appendChild(wrapper.firstChild);
        var clipboard = {
            el: wrapper,
            paste: function(dest) {
                if (!dest) return clipboard;
                var destEl = utils.resolveHost(dest);
                if (destEl) destEl.appendChild(wrapper);
                return clipboard;
            }
        };
        if (target) clipboard.paste(target);
        return clipboard;
    };

    // ============================================================
    // takeOver
    // ============================================================
    var _takeOver = false, _origAttachShadow = null, _hijackInstalled = false;

    function _installHijack() {
        if (_hijackInstalled) return;
        _hijackInstalled = true;
        _origAttachShadow = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function(init) {
            var root = _origAttachShadow.call(this, init);
            if (_takeOver && init && init.mode === 'open') {
                if (!shadowit._instances.has(this)) {
                    // 如果该元素已有 ShadowRoot（由其他库创建），直接关联，不重复创建实例
                    var name = this.getAttribute('data-sdit-name') || this.id ||
                        (this.tagName ? this.tagName.toLowerCase() : 'el') + '-' + Date.now().toString(36);
                    var inst = new ShadowIt(null, { name: name });
                    inst._host = this; inst._root = root;
                    inst._mounted = true; inst._rendered = true;
                    shadowit._instances.set(this, inst);
                    shadowit._nameMap[name] = inst;
                }
            }
            return root;
        };
    }

    function _uninstallHijack() {
        if (!_hijackInstalled) return;
        _hijackInstalled = false;
        if (_origAttachShadow) { Element.prototype.attachShadow = _origAttachShadow; _origAttachShadow = null; }
    }

    Object.defineProperty(shadowit, 'takeOver', {
        get: function() { return _takeOver; },
        set: function(val) {
            if (typeof val !== 'boolean') { console.warn('[shadowit] takeOver 必须是布尔值 (true/false)，已忽略'); return; }
            _takeOver = val;
            val ? _installHijack() : _uninstallHijack();
        },
        enumerable: true, configurable: false
    });

    // ============================================================
    // 自定义标签注册
    // ============================================================
    shadowit.define = function(name, tpl, css) {
        if (utils.isString(tpl) && !utils.isObject(arguments[1])) {
            var opts = { template: tpl };
            if (css) opts.css = css;
            return shadowit._define(name, opts);
        }
        return shadowit._define(name, tpl || {});
    };

    shadowit._define = function(tagName, options) {
        if (!tagName.includes('-')) throw new Error('[shadowit] 自定义标签名必须包含中划线 "-"');

        var template = options.template || '';
        var cssVal = options.css || options.styles || '';
        var data = options.data || {};
        var mode = options.mode || 'open';               // 支持 mode 配置
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
            self._template = template; self._css = cssVal; self._mode = mode;
            return self;
        }
        ShadowItElement.prototype = Object.create(HTMLElement.prototype);
        ShadowItElement.prototype.constructor = ShadowItElement;

        ShadowItElement.prototype.connectedCallback = function() {
            if (this._instance) return;
            for (var i = 0; i < observedAttributes.length; i++) {
                var attr = observedAttributes[i];
                if (this.hasAttribute(attr)) this._data[attr] = this.getAttribute(attr);
            }
            var self = this;
            var shadowitInst = shadowit(this, {
                template: this._template, css: this._css, mode: this._mode,
                data: this._data, name: this._instanceName,
                onError: onError, eventsOnHost: eventsOnHost,
                lifecycle: {
                    beforeRender: lifecycle.beforeRender ? function() { lifecycle.beforeRender.call(self); } : null,
                    afterRender: function(data) { if (lifecycle.afterRender) lifecycle.afterRender.call(self, data); },
                    beforeUpdate: lifecycle.beforeUpdate ? function(newData, oldData) { lifecycle.beforeUpdate.call(self, newData, oldData); } : null,
                    afterUpdate: lifecycle.afterUpdate ? function(newData, currentData) { lifecycle.afterUpdate.call(self, newData, currentData); } : null,
                    destroy: function() { if (lifecycle.destroy) lifecycle.destroy.call(self); }
                }
            });
            this._instance = shadowitInst;
            if (connected) connected.call(this);
        };

        ShadowItElement.prototype.disconnectedCallback = function() {
            if (this._instance) { this._instance.destroy(); this._instance = null; }
            if (disconnected) disconnected.call(this);
        };

        ShadowItElement.prototype.attributeChangedCallback = function(attrName, oldVal, newVal) {
            if (oldVal === newVal) return;
            if (this._attributeChangedHandler) {
                this._attributeChangedHandler.call(this, attrName, oldVal, newVal);
            } else {
                if (this._instance) { var d = {}; d[attrName] = newVal; this._instance.update(d); }
                else { this._data[attrName] = newVal; }
            }
        };

        Object.defineProperty(ShadowItElement, 'observedAttributes', { get: function() { return observedAttributes; } });

        if (!customElements.get(tagName)) customElements.define(tagName, ShadowItElement);

        return {
            _tagName: tagName, _elementClass: ShadowItElement,
            _getInstances: function() {
                var result = [];
                var names = Object.keys(shadowit._nameMap);
                for (var i = 0; i < names.length; i++) {
                    var inst = shadowit._nameMap[names[i]];
                    if (inst && inst._host && inst._host.tagName === tagName.toUpperCase()) result.push(inst);
                }
                return result;
            },
            destroy: function() { var insts = this._getInstances(); for (var i = 0; i < insts.length; i++) insts[i].destroy(); },
            on: function(event, selector, handler) { var insts = this._getInstances(); for (var i = 0; i < insts.length; i++) insts[i].on(event, selector, handler); return this; },
            off: function(event, selector, handler) { var insts = this._getInstances(); for (var i = 0; i < insts.length; i++) insts[i].off(event, selector, handler); return this; },
            data: function(newData) { var insts = this._getInstances(); for (var i = 0; i < insts.length; i++) insts[i].data(newData); return this; },
            template: function(tpl) { var insts = this._getInstances(); for (var i = 0; i < insts.length; i++) { insts[i].template(tpl); insts[i].render(); } return this; },
            css: function(cssStr) { var insts = this._getInstances(); for (var i = 0; i < insts.length; i++) insts[i].css(cssStr); return this; }
        };
    };

    shadowit.sdit = shadowit;
    shadowit.shadowIt = shadowit;

    return shadowit;
}));