/**
 * shadowit - Shadow DOM 控制库 v2.0.0
 * 微响应式、模板预编译引擎、事件委托白名单、模块隔离、
 * CSS Display Toggle (#await)、内存泄漏修复、错误日志美化
 * https://github.com/monkey2582/shadowit
 * @version 2.0.0
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

    // ===== Module 1: Utils =====

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

        _findClosingBraces: function(template, startPos) {
            var inSingle = false, inDouble = false;
            for (var i = startPos; i < template.length - 1; i++) {
                var ch = template[i];
                if (ch === '\\') { i++; continue; }
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

        // 纯路径条件求值
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

        // 表达式求值：支持简单路径、../ 引用、以及 Number/JSON/Array/Object/String 等全局对象
        _evalExpr: function(expr, data) {
            if (!expr) return undefined;
            expr = expr.trim();

            // 简单路径：myVar, a.b.c
            if (/^[a-zA-Z_$][\w.$]*$/.test(expr)) {
                return utils.getNested(data, expr);
            }

            // ../ 父级引用
            if (/^\.\.\//.test(expr)) {
                var parts = expr.split('/'), levels = 0, path = '';
                for (var pi = 0; pi < parts.length; pi++) {
                    if (parts[pi] === '..') levels++; else { path = parts[pi]; break; }
                }
                var parentData = utils.getParentData(data, levels);
                if (parentData) return utils.getNested(parentData, path);
                return undefined;
            }

            // 复杂表达式：构造安全上下文，注入 data 属性 + $data 引用
            try {
                var keys = [], vals = [];
                for (var k in data) {
                    if (data.hasOwnProperty(k) && /^[a-zA-Z_$][\w]*$/.test(k)) {
                        keys.push(k);
                        vals.push(data[k]);
                    }
                }
                keys.push('$data');
                vals.push(data);
                var fn = new Function(keys.join(','), 'return (' + expr + ')');
                return fn.apply(null, vals);
            } catch (e) {
                return undefined;
            }
        },

        // 模板内容编码（用于存储到 data 属性中）
        _encodeTemplate: function(tpl) {
            return tpl.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },

        // ============================================================
        // Tokenizer 模板解析器（单次扫描 → token 数组 → 递归处理）
        // 替代旧版 while + indexOf + _extractBlock 反复扫描
        // ============================================================

        // 单次扫描模板字符串，生成 token 数组
        _tokenize: function(template) {
            var tokens = [];
            var pos = 0, len = template.length;
            while (pos < len) {
                var openIdx = template.indexOf('{{', pos);
                if (openIdx === -1) {
                    tokens.push({ type: 'text', value: template.slice(pos) });
                    break;
                }
                if (openIdx > pos) {
                    tokens.push({ type: 'text', value: template.slice(pos, openIdx) });
                }
                var closeIdx = utils._findClosingBraces(template, openIdx + 2);
                if (closeIdx === -1) {
                    tokens.push({ type: 'text', value: template.slice(openIdx) });
                    break;
                }
                var tag = template.slice(openIdx + 2, closeIdx).trim();
                pos = closeIdx + 2;

                // 注释
                if (tag.indexOf('--') === 0) continue;

                // 块关闭
                if (tag.indexOf('/') === 0) {
                    var closeName = tag.slice(1);
                    // await 分支闭合标签（then/catch/loading/finally）→ 不参与深度计数
                    if (closeName === 'then' || closeName === 'catch' || closeName === 'loading' || closeName === 'finally') {
                        tokens.push({ type: 'await_branch_close', name: closeName });
                    } else if (closeName === 'else' || closeName === 'elseif') {
                        // else/elseif 闭合标签 → 无操作（分支已由 else token 自动分割）
                        tokens.push({ type: 'else_close', name: closeName });
                    } else {
                        tokens.push({ type: 'block_close', name: closeName });
                    }
                    continue;
                }

                // 块打开
                if (tag.indexOf('#') === 0) {
                    var spaceIdx = tag.indexOf(' ');
                    var blockName = spaceIdx > -1 ? tag.slice(1, spaceIdx) : tag.slice(1);
                    var blockArg = spaceIdx > -1 ? tag.slice(spaceIdx + 1).trim() : '';
                    if (blockName === 'else' || blockName === 'elseif') {
                        tokens.push({ type: 'else', cond: blockArg || null });
                    } else if (blockName === 'then' || blockName === 'catch' || blockName === 'loading' || blockName === 'finally') {
                        // await 分支打开标签 → 不参与深度计数
                        tokens.push({ type: 'await_branch', name: blockName, arg: blockArg });
                    } else {
                        tokens.push({ type: 'block_open', name: blockName, arg: blockArg });
                    }
                    continue;
                }

                // 普通插值
                tokens.push({ type: 'expr', value: tag });
            }
            return tokens;
        },

        // 递归处理 token 数组，生成带标注的 HTML
        _processTokens: function(tokens, startIdx, data, onceCache, pendingPromises, methods) {
            methods = methods || {};
            var result = '';
            var i = startIdx;
            while (i < tokens.length) {
                var token = tokens[i];

                if (token.type === 'text') {
                    result += token.value;
                    i++;
                } else if (token.type === 'expr') {
                    var tag = token.value;
                    if (/^[a-zA-Z_$][\w.$]*$/.test(tag)) {
                        var val = utils.getNested(data, tag);
                        var esc = val !== undefined && val !== null ? utils.escapeHtml(val) : '';
                        result += '<s-text data-path="' + utils.escapeHtml(tag) + '">' + esc + '</s-text>';
                    } else if (/^\.\.\//.test(tag)) {
                        var parts = tag.split('/'), levels = 0, path = '';
                        for (var pi = 0; pi < parts.length; pi++) {
                            if (parts[pi] === '..') levels++; else { path = parts[pi]; break; }
                        }
                        var parentData = utils.getParentData(data, levels);
                        if (parentData) {
                            var pval = utils.getNested(parentData, path);
                            var pesc = pval !== undefined && pval !== null ? utils.escapeHtml(pval) : '';
                            result += '<s-text data-path="' + utils.escapeHtml(tag) + '">' + pesc + '</s-text>';
                        }
                    } else {
                        // 复杂表达式：JSON.stringify(x), Number(y), Array.isArray(z) 等
                        var val = utils._evalExpr(tag, data);
                        var esc = val !== undefined && val !== null ? utils.escapeHtml(val) : '';
                        result += '<s-text data-expr="' + utils.escapeHtml(tag) + '">' + esc + '</s-text>';
                    }
                    i++;
                } else if (token.type === 'block_open') {
                    var blockName = token.name;
                    var blockArg = token.arg;

                    // 收集块内容（处理嵌套）
                    var depth = 1;
                    var blockTokens = [];
                    var j = i + 1;
                    while (j < tokens.length && depth > 0) {
                        var tk = tokens[j];
                        if (tk.type === 'block_open') depth++;
                        else if (tk.type === 'block_close') {
                            depth--;
                            if (depth === 0) { j++; break; }
                        }
                        blockTokens.push(tk);
                        j++;
                    }
                    i = j; // 跳到块结束之后

                    if (blockName === 'if') {
                        var ifCond = blockArg;
                        var encodedTpl = utils._encodeTemplate(utils._tokensToTemplate(blockTokens));
                        var branches = utils._splitIfBranchesTokens(blockTokens, ifCond);
                        var rendered = '';
                        if (ifCond) {
                            for (var bi = 0; bi < branches.length; bi++) {
                                if (branches[bi].condition === null || utils.evalCondition(branches[bi].condition, data)) {
                                    rendered = utils._processTokens(branches[bi].tokens, 0, data, onceCache, pendingPromises, methods);
                                    break;
                                }
                            }
                        } else {
                            rendered = utils._processTokens(blockTokens, 0, data, onceCache, pendingPromises, methods);
                        }
                        result += '<s-if data-cond="' + utils.escapeHtml(ifCond || '') + '" data-template="' + encodedTpl + '">' + rendered + '</s-if>';

                    } else if (blockName === 'for') {
                        var forExpr = blockArg;
                        var forMatch = forExpr.match(/^(\w+)\s+of\s+([\w.]+)(?:\s+key\s*=\s*"([^"]*)")?\s*$/);
                        var encodedForTpl = utils._encodeTemplate(utils._tokensToTemplate(blockTokens));
                        if (forMatch) {
                            var items = utils.getNested(data, forMatch[2]);
                            var itemName = forMatch[1];
                            var trackKey = forMatch[3] || null;
                            var forRendered = '';
                            if (utils.isArray(items) && items.length > 0) {
                                for (var fi = 0; fi < items.length; fi++) {
                                    var listItem = items[fi];
                                    var ctx = {};
                                    for (var dk in data) { if (data.hasOwnProperty(dk)) ctx[dk] = data[dk]; }
                                    ctx.index = fi; ctx.parent = data; ctx[itemName] = listItem;
                                    var keyVal = '__idx_' + fi;
                                    if (trackKey) { var k = utils.getNested(listItem, trackKey); if (k !== undefined) keyVal = k; }
                                    ctx['@key'] = keyVal;
                                    var itemRendered = utils._processTokens(blockTokens, 0, ctx, onceCache, pendingPromises, methods);
                                    forRendered += '<s-k data-key="' + keyVal + '">' + itemRendered + '</s-k>';
                                }
                            }
                            result += '<s-for data-expr="' + utils.escapeHtml(forExpr) + '" data-key="' + (trackKey || '') + '" data-template="' + encodedForTpl + '">' + forRendered + '</s-for>';
                        }

                    } else if (blockName === 'show') {
                        var showExpr = blockArg;
                        var showContent = utils._processTokens(blockTokens, 0, data, onceCache, pendingPromises, methods);
                        var showVal = utils.evalCondition(showExpr, data);
                        result += '<s-show data-path="' + utils.escapeHtml(showExpr) + '"' + (showVal ? '' : ' style="display:none"') + '>' + showContent + '</s-show>';

                    } else if (blockName === 'once') {
                        var onceKey = 'once_' + (blockTokens.length > 0 ? blockTokens[0].value || '' : '') + '_' + Math.random();
                        if (onceCache[onceKey]) {
                            result += '<s-once>' + onceCache[onceKey] + '</s-once>';
                        } else {
                            var onceRendered = utils._processTokens(blockTokens, 0, data, onceCache, pendingPromises, methods);
                            onceCache[onceKey] = onceRendered;
                            result += '<s-once>' + onceRendered + '</s-once>';
                        }

                    } else if (blockName === 'await') {
                        var awaitExpr = blockArg;
                        var awaitParts = utils._splitAwaitBranchesTokens(blockTokens);
                        var awaitVal = utils.getNested(data, awaitExpr);
                        var urlExpr = awaitExpr;

                        // 1. URL 字符串字面量：{{#await "https://..."}}
                        if (/^["'][^"']+["']$/.test(awaitExpr)) {
                            urlExpr = awaitExpr.slice(1, -1);
                            awaitVal = fetch(urlExpr).then(function(r) {
                                if (!r.ok) throw new Error('HTTP ' + r.status);
                                return r.json();
                            });
                        }
                        // 2. new Promise(...) 表达式
                        else if (/^new\s+Promise\s*\(/.test(awaitExpr)) {
                            try {
                                var dataAndMethods = {};
                                for (var dk2 in data) { if (data.hasOwnProperty(dk2)) dataAndMethods[dk2] = data[dk2]; }
                                for (var mk2 in methods) { if (methods.hasOwnProperty(mk2)) dataAndMethods[mk2] = methods[mk2]; }
                                awaitVal = (new Function('_ctx', 'return ' + awaitExpr))(dataAndMethods);
                                if (awaitVal && typeof awaitVal.then !== 'function') {
                                    awaitVal = undefined;
                                }
                            } catch (e) {
                                awaitVal = undefined;
                            }
                        }
                        // 3. 变量：从 data 取值，判断类型
                        else if (awaitVal !== undefined) {
                            // 变量是字符串 → 当作 URL 去 fetch
                            if (typeof awaitVal === 'string') {
                                urlExpr = awaitVal;
                                awaitVal = fetch(awaitVal).then(function(r) {
                                    if (!r.ok) throw new Error('HTTP ' + r.status);
                                    return r.json();
                                });
                            }
                            // 变量是函数 → 调用它
                            else if (typeof awaitVal === 'function') {
                                var fnResult = awaitVal();
                                if (fnResult && typeof fnResult.then === 'function') {
                                    awaitVal = fnResult;
                                } else {
                                    // 同步返回，直接当作 resolved 值
                                    awaitVal = fnResult;
                                }
                            }
                            // 变量是 Promise → 直接用
                        }
                        // 4. 函数调用表达式：{{#await fetchData()}}
                        else if (/^(\w+)\(\)$/.test(awaitExpr)) {
                            var fnName = awaitExpr.slice(0, -2);
                            var fn = utils.isFunction(data[fnName]) ? data[fnName] :
                                (utils.isFunction(methods[fnName]) ? methods[fnName] : null);
                            if (fn) {
                                var fnResult = fn();
                                if (fnResult && typeof fnResult.then === 'function') {
                                    awaitVal = fnResult;
                                } else {
                                    awaitVal = fnResult;
                                }
                            }
                        }

                        var loadingContent = utils._processTokens(awaitParts.loading, 0, data, onceCache, pendingPromises, methods);
                        var thenCtx = {};
                        for (var tdk in data) { if (data.hasOwnProperty(tdk)) thenCtx[tdk] = data[tdk]; }
                        if (awaitParts.thenVar && awaitVal !== undefined && awaitVal !== null && typeof awaitVal.then !== 'function') {
                            thenCtx[awaitParts.thenVar] = awaitVal;
                        }
                        var thenContent = utils._processTokens(awaitParts.then, 0, thenCtx, onceCache, pendingPromises, methods);
                        var catchContent = utils._processTokens(awaitParts.catch, 0, data, onceCache, pendingPromises, methods);
                        var finallyContent = utils._processTokens(awaitParts.finally, 0, data, onceCache, pendingPromises, methods);

                        var isPromise = awaitVal && typeof awaitVal.then === 'function';
                        var isResolved = awaitVal !== undefined && awaitVal !== null && typeof awaitVal.then !== 'function';

                        result += '<s-await data-path="' + utils.escapeHtml(urlExpr) + '" data-await-expr="' + utils.escapeHtml(awaitExpr) + '" data-await-tokens="' + utils.escapeHtml(JSON.stringify(blockTokens)) + '">';
                        result += '<s-await-branch data-state="loading"' + (isResolved ? ' style="display:none"' : '') + '>' + loadingContent + '</s-await-branch>';
                        result += '<s-await-branch data-state="then"' + (isResolved ? '' : ' style="display:none"') + '>' + thenContent + '</s-await-branch>';
                        result += '<s-await-branch data-state="catch" style="display:none">' + catchContent + '</s-await-branch>';
                        result += '<s-await-branch data-state="finally" style="display:none">' + finallyContent + '</s-await-branch>';
                        result += '</s-await>';

                        if (isPromise && pendingPromises) {
                            pendingPromises.push({
                                promise: awaitVal,
                                awaitExpr: urlExpr,
                                awaitRawExpr: awaitExpr,
                                thenTokens: awaitParts.then,
                                thenVar: awaitParts.thenVar,
                                catchTokens: awaitParts.catch,
                                catchVar: awaitParts.catchVar,
                                finallyTokens: awaitParts.finally
                            });
                        }
                    }
                } else if (token.type === 'else') {
                    // else 在 _splitIfBranchesTokens 中处理，这里不应该到达
                    i++;
                } else {
                    i++;
                }
            }
            return result;
        },

        // 将 token 数组转回模板字符串（用于存储 #if/#for 原始模板）
        _tokensToTemplate: function(tokens) {
            var s = '';
            for (var i = 0; i < tokens.length; i++) {
                var t = tokens[i];
                if (t.type === 'text') s += t.value;
                else if (t.type === 'expr') s += '{{' + t.value + '}}';
                else if (t.type === 'block_open') s += '{{#' + t.name + (t.arg ? ' ' + t.arg : '') + '}}';
                else if (t.type === 'block_close') s += '{{/' + t.name + '}}';
                else if (t.type === 'await_branch') s += '{{#' + t.name + (t.arg ? ' ' + t.arg : '') + '}}';
                else if (t.type === 'await_branch_close') s += '{{/' + t.name + '}}';
                else if (t.type === 'else') s += t.cond ? '{{#elseif ' + t.cond + '}}' : '{{#else}}';
                else if (t.type === 'else_close') s += '{{/' + t.name + '}}';
            }
            return s;
        },

        // 在 token 数组中按 #else/#elseif 分割分支
        // initialCond: 外部 #if 的条件表达式（如 "count > 0"），用于第一个分支
        _splitIfBranchesTokens: function(tokens, initialCond) {
            var branches = [];
            var current = [];
            // 收集 else 标记及其条件
            var elseConds = [];
            for (var i = 0; i < tokens.length; i++) {
                if (tokens[i].type === 'else') {
                    branches.push({ condition: null, tokens: current });
                    elseConds.push(tokens[i].cond || null);
                    current = [];
                } else {
                    current.push(tokens[i]);
                }
            }
            branches.push({ condition: null, tokens: current });
            // 第一个分支使用外部传入的 initialCond，后续分支取 else 标记的 cond
            branches[0].condition = initialCond || null;
            for (var ei = 0; ei < elseConds.length; ei++) {
                if (ei + 1 < branches.length) {
                    branches[ei + 1].condition = elseConds[ei];
                }
            }
            return branches;
        },

        // 在 token 数组中按 #then/#catch/#loading/#finally 分割 #await 分支
        // 这些标签不参与深度计数，可写可不写闭合标签
        _splitAwaitBranchesTokens: function(tokens) {
            var result = { loading: [], then: [], thenVar: null, catch: [], catchVar: null, finally: [] };
            var current = 'loading';
            for (var i = 0; i < tokens.length; i++) {
                var t = tokens[i];
                if (t.type === 'await_branch' && (t.name === 'then' || t.name === 'catch' || t.name === 'loading' || t.name === 'finally')) {
                    current = t.name;
                    if (t.name === 'then' && t.arg) result.thenVar = t.arg;
                    if (t.name === 'catch' && t.arg) result.catchVar = t.arg;
                    continue;
                }
                if (t.type === 'await_branch_close') {
                    continue;
                }
                result[current].push(t);
            }
            return result;
        },

        // 入口：解析模板字符串，输出带标注的 HTML
        parseTemplate: function(template, data, onceCache, pendingPromises, methods) {
            if (!template) return '';
            onceCache = onceCache || {};
            pendingPromises = pendingPromises || null;
            methods = methods || {};
            template = utils.stripComments(template);
            // 快速路径：模板中没有 {{ 插值语法，直接返回原样，跳过解析
            if (template.indexOf('{{') === -1) return template;
            var tokens = utils._tokenize(template);
            return utils._processTokens(tokens, 0, data, onceCache, pendingPromises, methods);
        },

        getParentData: function(data, levels) {
            var result = data;
            for (var i = 0; i < levels; i++) {
                if (result && result.parent) result = result.parent; else return undefined;
            }
            return result;
        },

        _splitAwaitBranches: function(content) {
            var result = { loading: '', then: '', thenVar: null, catch: '', catchVar: null };
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
                result.loading = content;
                return result;
            }
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

        renderTemplate: function(template, data, onceCache, pendingPromises, methods) {
            if (!template) return '';
            return utils.parseTemplate(template, data, onceCache, pendingPromises, methods);
        },

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
                    // 解析事件参数时支持特殊变量
                    if (s === '$event') return { $event: true };
                    if (s === '$el') return { $el: true };
                    if (s === '$parent') return { $parent: true };
                    if (s === '$inst') return { $inst: true };
                    return { $path: s };
                });
                return { name: match[1], args: args };
            }
            return { name: expr, args: [] };
        },

        };// ===== Module 3: Template Engine (compileBindings) =====

    function compileBindings(rootEl) {
        var bindings = { texts: [], shows: [], ifs: [], fors: [], awaits: [], onces: [] };

        function walk(node) {
            if (node.nodeType !== 1 && node.nodeType !== 11) return;
            // DocumentFragment/ShadowRoot 没有 tagName，直接遍历子节点
            if (node.nodeType === 11) {
                var fragChildren = node.childNodes;
                for (var fc = 0; fc < fragChildren.length; fc++) {
                    walk(fragChildren[fc]);
                }
                return;
            }
            var tag = node.tagName.toLowerCase();

            if (tag === 's-text') {
                var path = node.getAttribute('data-path');
                var expr = node.getAttribute('data-expr');
                if (path) {
                    bindings.texts.push({ node: node, path: path, expr: null });
                } else if (expr) {
                    bindings.texts.push({ node: node, path: null, expr: expr });
                }
            } else if (tag === 's-show') {
                var showPath = node.getAttribute('data-path');
                if (showPath) {
                    bindings.shows.push({ node: node, path: showPath });
                }
            } else if (tag === 's-if') {
                var cond = node.getAttribute('data-cond');
                var tpl = node.getAttribute('data-template');
                if (cond !== null && tpl) {
                    // 预编译：解码 data-template 并 tokenize，避免每次更新重复扫描字符串
                    var decodedTpl = tpl.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                    var preTokens = utils._tokenize(decodedTpl);
                    bindings.ifs.push({ node: node, cond: cond, template: tpl, tokens: preTokens });
                }
            } else if (tag === 's-for') {
                var expr = node.getAttribute('data-expr');
                var key = node.getAttribute('data-key') || '';
                var ftpl = node.getAttribute('data-template');
                if (expr && ftpl) {
                    var decodedForTpl = ftpl.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                    var preForTokens = utils._tokenize(decodedForTpl);
                    bindings.fors.push({ node: node, expr: expr, key: key, template: ftpl, tokens: preForTokens });
                }
            } else if (tag === 's-await') {
                var awaitPath = node.getAttribute('data-path');
                var awaitExpr = node.getAttribute('data-await-expr') || '';
                var awaitTokensStr = node.getAttribute('data-await-tokens') || '';
                var awaitTokens = null;
                try { if (awaitTokensStr) awaitTokens = JSON.parse(awaitTokensStr); } catch(e) {}
                if (awaitPath) {
                    bindings.awaits.push({ node: node, path: awaitPath, expr: awaitExpr, tokens: awaitTokens });
                }} else if (tag === 's-once') {
                bindings.onces.push({ node: node });
            }

            var children = node.childNodes;
            for (var i = 0; i < children.length; i++) {
                walk(children[i]);
            }
        }

        walk(rootEl);
        return bindings;
    }

    // ===== Module 4: EventDelegator =====

    var ALLOWED_EVENTS = { click: 1, input: 1, change: 1, mouseover: 1, mouseout: 1, submit: 1, focus: 1, blur: 1, keydown: 1, keyup: 1 };

    function DelegatedEventManager(root, dataFn, methodsFn, shadowItInstance) {
        this._root = root;
        this._dataFn = dataFn;
        this._methodsFn = methodsFn;
        this._listeners = {};
        this._handlers = {};
        this._boundNodes = new WeakSet();
        this._shadowItInstance = shadowItInstance || null;
    }

    DelegatedEventManager.prototype.scan = function(newNodes) {
        if (!this._root) return this;

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

        var nodesToScan;
        if (newNodes && newNodes.length > 0) {
            nodesToScan = newNodes;
        } else {
            nodesToScan = this._root.querySelectorAll('*');
        }

        for (var i = 0; i < nodesToScan.length; i++) {
            var el = nodesToScan[i];
            if (this._boundNodes.has(el)) continue;
            this._boundNodes.add(el);

            var attrs = el.getAttributeNames ? el.getAttributeNames() : [];
            for (var j = 0; j < attrs.length; j++) {
                var name = attrs[j];
                if (name.charAt(0) === '@' && name !== '@key') {
                    var attrValue = el.getAttribute(name);
                    el.removeAttribute(name);

                    if (attrValue) {
                        var eventType = name.slice(1);
                        // 事件白名单检查
                        if (!ALLOWED_EVENTS[eventType]) continue;

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
        this._ensureListeners();
        return this;
    };

    DelegatedEventManager.prototype._ensureListeners = function() {
        var self = this;
        for (var et in this._listeners) {
            if (this._listeners.hasOwnProperty(et) && !this._handlers[et]) {
                this._root.removeEventListener(et, this._listeners[et]);
                delete this._listeners[et];
            }
        }
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

        // 从触发元素向上查找 s-k 上下文（for 循环局部变量）
        var ctxData = data;
        var walkEl = el;
        while (walkEl && walkEl !== this._root) {
            if (walkEl.__sdit_ctx) {
                ctxData = walkEl.__sdit_ctx;
                break;
            }
            walkEl = walkEl.parentNode;
        }

        var resolvedArgs = [];
        for (var i = 0; i < h.parsedArgs.length; i++) {
            var arg = h.parsedArgs[i];
            if (arg && typeof arg === 'object' && arg.$event) {
                resolvedArgs.push(e);
            } else if (arg && typeof arg === 'object' && arg.$el) {
                resolvedArgs.push(el);
            } else if (arg && typeof arg === 'object' && arg.$parent) {
                resolvedArgs.push(el.parentNode);
            } else if (arg && typeof arg === 'object' && arg.$inst) {
                resolvedArgs.push(instance);
            } else if (arg && typeof arg === 'object' && arg.$path) {
                // 优先级：s-k 上下文 > 顶层 data > methods
                var val = utils.getNested(ctxData, arg.$path);
                if (val === undefined) val = utils.getNested(data, arg.$path);
                if (val === undefined) val = utils.getNested(methods, arg.$path);
                resolvedArgs.push(val !== undefined ? val : arg.$path);
            } else {
                resolvedArgs.push(arg);
            }
        }
        // this 指向实例，有参数时传解析参数，无参数时默认传 ($el, $parent, $inst, $event)
        var instance = this._shadowItInstance;
        if (!instance) return;
        if (h.parsedArgs.length > 0) {
            fn.apply(instance, resolvedArgs);
        } else {
            fn.apply(instance, [el, el.parentNode, instance, e]);
        }
        // 微响应式：事件处理后自动更新视图
        if (this._shadowItInstance && !this._shadowItInstance._destroyed) {
            this._shadowItInstance.update();
        }
    };

    DelegatedEventManager.prototype.destroy = function() {
        for (var et in this._listeners) {
            if (this._listeners.hasOwnProperty(et)) {
                this._root.removeEventListener(et, this._listeners[et]);
            }
        }
        this._listeners = {};
        this._handlers = {};
        this._root = null;
    };

    // ===== Module 5: ShadowIt Core =====

    function ShadowIt(host, options) {
        if (!isSupported()) {
            console.warn('[shadowit] 当前浏览器不支持 Shadow DOM 或 Custom Elements，请加载 polyfill。');
        }
        options = options || {};
        var cssVal = options.css || options.styles || '';

        // 调用 setup() 获取扁平对象：函数 → methods，非函数 → data，computed 特殊提取
        var setupResult = utils.isFunction(options.setup) ? options.setup() : {};
        var setupData = {};
        var setupMethods = {};
        var setupComputed = {};
        for (var sk in setupResult) {
            if (setupResult.hasOwnProperty(sk)) {
                if (sk === 'computed' && utils.isObject(setupResult[sk])) {
                    setupComputed = setupResult[sk];
                } else if (utils.isFunction(setupResult[sk])) {
                    setupMethods[sk] = setupResult[sk];
                } else {
                    setupData[sk] = setupResult[sk];
                }
            }
        }

        this.options = {
            template: options.template || '',
            css: cssVal,
            mode: options.mode || 'open',
            delegatesFocus: options.delegatesFocus,
            clonable: options.clonable,
            serializable: options.serializable,
            slotAssignment: options.slotAssignment,
            customElementRegistry: options.customElementRegistry,
            onError: options.onError || null,
            eventsOnHost: options.eventsOnHost || false,
            name: options.name || null
        };

        this._id = utils.uid();
        this._data = utils.deepClone(setupData);
        this._methods = setupMethods;
        this._computed = setupComputed;
        
        // 缓存高频 utils 函数引用，避免属性查找
        this._getNested = utils.getNested;
        this._evalExpr = utils._evalExpr;
        this._evalCondition = utils.evalCondition;
        this._processTokens = utils._processTokens;
        this._escapeHtml = utils.escapeHtml;
        this._isArray = utils.isArray;
        this._isFunction = utils.isFunction;

        this._rendered = false;
        this._destroyed = false;
        this._mounted = false;
        this._pendingSelector = null;
        this._queryCache = new Map();
        this._onceCache = {};
        this._updating = false;
        this._updateScheduled = false;
        this._pendingPromises = [];
        this._bindings = null;
        

        this._host = null;
        this._root = null;
        this._lastHtml = '';
        this._delegatedEvents = null;
        this._groupInstances = [];

        // lifecycle hooks 提升为顶层选项
        this._hooks = {
            beforeRender: options.beforeRender || null,
            afterRender: options.afterRender || null,
            beforeUpdate: options.beforeUpdate || null,
            afterUpdate: options.afterUpdate || null,
            shouldUpdate: options.shouldUpdate || null,
            destroy: options.destroy || null
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

    ShadowIt._rootSeed = 0;// ----- Mount -----

    ShadowIt.prototype._mountOne = function(hostEl) {
        if (!hostEl) throw new Error('[shadowit] 宿主元素未找到');
        this._host = hostEl;
        this._root = this._host.attachShadow({
            mode: this.options.mode || 'open',
            delegatesFocus: this.options.delegatesFocus,
            clonable: this.options.clonable,
            serializable: this.options.serializable,
            slotAssignment: this.options.slotAssignment,
            customElementRegistry: this.options.customElementRegistry
        });
        this._mounted = true;
        shadowit._instances.set(this._host, this);

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
            function() { return self._methods; },
            self
        );

        this.render();
        this._applyCSS();
        return this;
    };

    ShadowIt.prototype.mount = function(host) {
        if (this._destroyed) throw new Error('[shadowit] 实例已销毁，无法挂载');

        if (utils.isArray(host) || (host && typeof host.length === 'number' && host.item)) {
            var hosts = shadowit._resolveHosts(host);
            if (hosts.length === 0) throw new Error('[shadowit] mount() 未找到任何有效宿主元素');
            var firstHost = hosts[0];
            if (this._mounted) {
                this._detachFromHost();
            }
            this._mountOne(firstHost);
            if (!this._groupInstances) this._groupInstances = [];
            for (var i = 1; i < hosts.length; i++) {
                var self = this;
                var clone = new ShadowIt(hosts[i], {
                    template: this.options.template,
                    css: this.options.css,
                    setup: function() {
                        var flat = {};
                        var cloned = utils.deepClone(self._data);
                        for (var dk in cloned) { if (cloned.hasOwnProperty(dk)) flat[dk] = cloned[dk]; }
                        for (var mk in self._methods) { if (self._methods.hasOwnProperty(mk)) flat[mk] = self._methods[mk]; }
                        flat.computed = self._computed;
                        return flat;
                    },
                    mode: this.options.mode,
                    onError: this.options.onError,
                    eventsOnHost: this.options.eventsOnHost,
                    beforeRender: this._hooks.beforeRender,
                    afterRender: this._hooks.afterRender,
                    beforeUpdate: this._hooks.beforeUpdate,
                    afterUpdate: this._hooks.afterUpdate,
                    shouldUpdate: this._hooks.shouldUpdate,
                    destroy: this._hooks.destroy
                });
                this._groupInstances.push(clone);
            }
            return this;
        }

        if (!host) throw new Error('[shadowit] mount() 需要指定宿主元素');

        var hostEl = utils.isString(host) ? document.querySelector(host) : host;
        if (!hostEl) throw new Error('[shadowit] 宿主元素未找到: ' + host);

        if (this._mounted) {
            this._detachFromHost();
        }

        this._mountOne(hostEl);
        return this;
    };

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
        this._bindings = null;
    };

    ShadowIt.prototype.unmount = function() {
        if (this._destroyed) return this;
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
        if (utils.isObject(newData)) {
            for (var key in newData) {
                if (!newData.hasOwnProperty(key)) continue;
                this._data[key] = newData[key];
            }
        }
        return this;
    };

    ShadowIt.prototype.setData = function(newData) {
        if (this._destroyed) return this;
        if (utils.isObject(newData)) {this._data = utils.deepClone(newData);
        }
        return this;
    };

    ShadowIt.prototype.getData = function() {
        return utils.deepClone(this._data);
    };

    // ----- 渲染与更新 -----

    ShadowIt.prototype._renderToHtml = function() {
        var html = this.options.template || '';
        if (utils.isFunction(html)) html = html(this._data);
        if (utils.isString(html)) html = utils.renderTemplate(html, this._data, this._onceCache, this._pendingPromises, this._methods);
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
            if (utils.isObject(newData)) {
                for (var key in newData) {
                    if (!newData.hasOwnProperty(key)) continue;
                    this._data[key] = newData[key];
                }
            }
            return this;
        }
        if (!this._mounted) {
            if (utils.isObject(newData)) {
                for (var dk in newData) {
                    if (!newData.hasOwnProperty(dk)) continue;
                    this._data[dk] = newData[dk];
                }
            }
            return this;
        }

        // 幽灵节点检测：宿主元素被移除时自动卸载
        if (this._host && !this._host.isConnected) {
            this._detachFromHost();
            return this;
        }

        this._updating = true;
        this._updateScheduled = false;
        var isFirstRender = !this._rendered;
        var oldData = isFirstRender ? null : utils.deepClone(this._data);
        try {
            if (isFirstRender) {
                this._callHook('beforeRender', this._host, this);
            } else {
                this._callHook('beforeUpdate', newData, oldData, this._host, this);
            }

            if (utils.isObject(newData)) {
                for (var ndk in newData) {
                    if (!newData.hasOwnProperty(ndk)) continue;
                    this._data[ndk] = newData[ndk];
                }
            }

            if (!isFirstRender && utils.isFunction(this._hooks.shouldUpdate)) {
                if (!this._hooks.shouldUpdate.call(this, newData, this._data, this._host, this)) {
                    this._updating = false;
                    return this;
                }
            }

            this._evalComputed();

            if (isFirstRender) {
                // 首次渲染：全量 HTML 生成 + 编译绑定
                this._pendingPromises = [];
                var html = this._renderToHtml();
                this._root.innerHTML = html;
                this._rendered = true;
                this._lastHtml = html;

                this._bindings = compileBindings(this._root);

                // 首次渲染后，为 s-k 元素设置上下文（用于事件参数解析）
                var fors = this._bindings.fors;
                for (var ffi = 0; ffi < fors.length; ffi++) {
                    var ffb = fors[ffi];
                    var fforMatch = ffb.expr.match(/^(\w+)\s+of\s+([\w.]+)(?:\s+key\s*=\s*"([^"]*)")?\s*$/);
                    if (!fforMatch) continue;
                    var fitemName = fforMatch[1];
                    var fitemsPath = fforMatch[2];
                    var fitems = utils.getNested(this._data, fitemsPath);
                    if (!utils.isArray(fitems)) fitems = [];
                    var fskChildren = ffb.node.querySelectorAll(':scope > s-k');
                    for (var fsi = 0; fsi < fskChildren.length && fsi < fitems.length; fsi++) {
                        var fctx = {};
                        for (var fdk in this._data) { if (this._data.hasOwnProperty(fdk)) fctx[fdk] = this._data[fdk]; }
                        fctx.index = fsi;
                        fctx.parent = this._data;
                        fctx[fitemName] = fitems[fsi];
                        fskChildren[fsi].__sdit_ctx = fctx;
                    }
                }

                this._delegatedEvents.scan();
                this._queryCache.clear();
                if (shadowit._cacheEnabled) shadowit.clearQueryCache();
                this._resolvePendingPromises();

                this._callHook('afterRender', this._data, this._host, this);
            } else {
                // 后续更新：使用绑定系统直接操作 DOM
                var structuralChange = this._applyBindings(this._bindings);

                // 仅在 DOM 结构变化时（#if/#for 重渲染）清除查询缓存
                if (structuralChange) {
                    this._queryCache.clear();
                    if (shadowit._cacheEnabled) shadowit.clearQueryCache();
                }

                this._callHook('afterUpdate', newData, this._data, this._host, this);
            }
        } catch (err) {
            this._handleError(err, isFirstRender ? 'render' : 'update');
        }
        this._updating = false;
        return this;
    };

    // ----- 绑定应用（直接 DOM 操作，跳过字符串解析） -----
    // 返回 true 表示发生了结构性 DOM 变化（#if/#for 重渲染）

    ShadowIt.prototype._applyBindings = function(bindings) {
        if (!bindings) return false;
        var data = this._data;
        var self = this;
        var structuralChange = false;

        // 高速缓存：局部变量引用
        var getNested = this._getNested;
        var evalExpr = this._evalExpr;
        var evalCondition = this._evalCondition;
        var processTokens = this._processTokens;
        var onceCache = this._onceCache;
        var methods = this._methods;

        // 过滤掉已断开的节点（一次性清理）
        var texts = bindings.texts;
        var shows = bindings.shows;
        var ifs = bindings.ifs;
        var fors = bindings.fors;
        var awaits = bindings.awaits;

        // texts: 直接设置 textContent（支持简单路径和复杂表达式）
        for (var i = 0, len = texts.length; i < len; i++) {
            var t = texts[i];
            if (!t.node || !t.node.isConnected) continue;
            var val;
            if (t.expr) {
                val = evalExpr(t.expr, data);
            } else {
                val = getNested(data, t.path);
            }
            var text = val !== undefined && val !== null ? String(val) : '';
            if (t.node.textContent !== text) {
                t.node.textContent = text;
            }
        }

        // shows: 直接设置 display
        for (var i = 0, len = shows.length; i < len; i++) {
            var s = shows[i];
            if (!s.node || !s.node.isConnected) continue;
            var visible = evalCondition(s.path, data);
            s.node.style.display = visible ? '' : 'none';
        }

        // ifs: 重新渲染条件块（结构性变化）
        for (var i = 0, len = ifs.length; i < len; i++) {
            var ib = ifs[i];
            if (!ib.node || !ib.node.isConnected) continue;
            var newRendered = self._renderIfBlock(ib.cond, ib.tokens, data);
            if (ib.node.innerHTML !== newRendered) {
                ib.node.innerHTML = newRendered;
                structuralChange = true;
                // innerHTML 替换后重扫事件绑定
                if (self._delegatedEvents) {
                    var ifNodes = ib.node.querySelectorAll('*');
                    var ifNodesArr = [];
                    for (var ifni = 0, ifnLen = ifNodes.length; ifni < ifnLen; ifni++) ifNodesArr.push(ifNodes[ifni]);
                    self._delegatedEvents.scan(ifNodesArr);
                }
            }
        }

        // fors: 键控 diff 重新渲染（结构性变化）
        for (var i = 0, len = fors.length; i < len; i++) {
            var fb = fors[i];
            if (!fb.node || !fb.node.isConnected) continue;
            // #for 的数据路径从 expr 中提取
            self._renderForBlock(fb, data);
            structuralChange = true;
        }

        // awaits: 变量变化后重新触发 Promise 解析
        for (var i = 0, len = awaits.length; i < len; i++) {
            var ab = awaits[i];
            if (!ab.node || !ab.node.isConnected) continue;
            if (ab.node.__sdit_await_done) continue;
            var awaitVal = getNested(data, ab.path);
            if (awaitVal !== undefined && awaitVal !== null) {
                ab.node.__sdit_await_done = true;
                self._triggerAwait(ab, awaitVal, data);
            }
        }

        return structuralChange;
    };

    // 渲染 #if 块（使用预编译的 token 数组，避免每次更新重新扫描字符串）
    ShadowIt.prototype._renderIfBlock = function(cond, tokens, data) {
        if (!tokens || tokens.length === 0) return '';
        if (cond) {
            var branches = utils._splitIfBranchesTokens(tokens, cond);
            for (var bi = 0, bLen = branches.length; bi < bLen; bi++) {
                if (branches[bi].condition === null || this._evalCondition(branches[bi].condition, data)) {
                    return this._processTokens(branches[bi].tokens, 0, data, this._onceCache, null, this._methods);
                }
            }
            return '';
        }
        return this._processTokens(tokens, 0, data, this._onceCache, null, this._methods);
    };

    // 渲染 #for 块（轻量级键控 diff，使用预编译 token 数组）
    ShadowIt.prototype._renderForBlock = function(fb, data) {
        var forExpr = fb.expr;
        var forMatch = forExpr.match(/^(\w+)\s+of\s+([\w.]+)(?:\s+key\s*=\s*"([^"]*)")?\s*$/);
        if (!forMatch) return;

        var itemName = forMatch[1];
        var itemsPath = forMatch[2];
        var trackKey = fb.key || null;
        var items = this._getNested(data, itemsPath);
        if (!this._isArray(items)) items = [];

        var tokens = fb.tokens;
        var oldKeyedChildren = [];
        var oldChildren = Array.from(fb.node.childNodes);
        for (var oi = 0, oLen = oldChildren.length; oi < oLen; oi++) {
            var oc = oldChildren[oi];
            if (oc.nodeType === 1 && oc.tagName === 'S-K') {
                oldKeyedChildren.push({ key: oc.getAttribute('data-key'), node: oc });
            }
        }

        var keyCtxMap = {};
        var newKeyedChildren = [];
        var newHtmlParts = [];
        var processTokens = this._processTokens;
        var onceCache = this._onceCache;
        var methods = this._methods;
        var getNested = this._getNested;
        for (var fi = 0, fiLen = items.length; fi < fiLen; fi++) {
            var listItem = items[fi];
            var ctx = {};
            for (var dk in data) { if (data.hasOwnProperty(dk)) ctx[dk] = data[dk]; }
            ctx.index = fi; ctx.parent = data; ctx[itemName] = listItem;
            var keyVal = '__idx_' + fi;
            if (trackKey) { var k = getNested(listItem, trackKey); if (k !== undefined) keyVal = k; }
            ctx['@key'] = keyVal;
            keyCtxMap[keyVal] = ctx;
            var itemRendered = processTokens(tokens, 0, ctx, onceCache, null, methods);
            newKeyedChildren.push({ key: keyVal, html: itemRendered });
            newHtmlParts.push('<s-k data-key="' + keyVal + '">' + itemRendered + '</s-k>');
        }

        // 轻量级键控 diff
        var oldKeyMap = {};
        for (var oki = 0, okLen = oldKeyedChildren.length; oki < okLen; oki++) {
            oldKeyMap[oldKeyedChildren[oki].key] = oldKeyedChildren[oki].node;
        }

        var newKeyMap = {};
        for (var nki = 0, nkLen = newKeyedChildren.length; nki < nkLen; nki++) {
            newKeyMap[newKeyedChildren[nki].key] = true;
        }

        // 移除旧的不再需要的 keyed 节点
        for (var rki = 0, rkLen = oldKeyedChildren.length; rki < rkLen; rki++) {
            if (!newKeyMap[oldKeyedChildren[rki].key]) {
                if (oldKeyedChildren[rki].node.parentNode) {
                    oldKeyedChildren[rki].node.parentNode.removeChild(oldKeyedChildren[rki].node);
                }
            }
        }

        // 重建子节点列表，收集新节点用于事件重扫
        var newChildList = [];
        var newNodes = [];
        for (var nci = 0, ncLen = newKeyedChildren.length; nci < ncLen; nci++) {
            var nk = newKeyedChildren[nci].key;
            var oldNode = oldKeyMap[nk];
            if (oldNode) {
                // 更新上下文（数据可能已变化）
                oldNode.__sdit_ctx = keyCtxMap[nk];
                if (oldNode.innerHTML !== newKeyedChildren[nci].html) {
                    oldNode.innerHTML = newKeyedChildren[nci].html;
                    // innerHTML 重建后，收集子节点及根节点用于事件重扫
                    var innerNodes = oldNode.querySelectorAll('*');
                    for (var ini = 0, inLen = innerNodes.length; ini < inLen; ini++) {
                        newNodes.push(innerNodes[ini]);
                    }
                    newNodes.push(oldNode);  // 根节点本身也可能带有 @click 等事件属性
                }
                newChildList.push(oldNode);
            } else {
                var tempDiv = document.createElement('div');
                tempDiv.innerHTML = newHtmlParts[nci];
                var cloned = tempDiv.firstChild;
                cloned.__sdit_ctx = keyCtxMap[nk];
                newChildList.push(cloned);
                // 收集新节点及其子树用于事件重扫
                newNodes.push(cloned);
                var subNodes = cloned.querySelectorAll('*');
                for (var sni = 0; sni < subNodes.length; sni++) {
                    newNodes.push(subNodes[sni]);
                }
            }
        }

        // 清空并使用 DocumentFragment 批量重建
        while (fb.node.firstChild) { fb.node.removeChild(fb.node.firstChild); }
        var frag = document.createDocumentFragment();
        for (var li = 0; li < newChildList.length; li++) {
            frag.appendChild(newChildList[li]);
        }
        fb.node.appendChild(frag);

        // 重建后重新扫描事件绑定（防止 innerHTML 替换丢失 __sdit_events 标记）
        if (newNodes.length > 0 && this._delegatedEvents) {
            this._delegatedEvents.scan(newNodes);
        }
    };

    // ----- 生命周期 -----

    ShadowIt.prototype._callHook = function(name) {
        var args = Array.prototype.slice.call(arguments, 1);
        var hook = this._hooks[name];
        if (utils.isFunction(hook)) {
            try { hook.apply(this, args); }
            catch (err) { this._handleError(err, 'lifecycle.' + name); }
        }
    };

    // ----- computed 计算属性 -----

    ShadowIt.prototype._evalComputed = function() {
        var computed = this._computed;
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

    // ----- #await Promise 处理（CSS Display Toggle） -----

    ShadowIt.prototype._resolvePendingPromises = function() {
        if (!this._pendingPromises || this._pendingPromises.length === 0) return;
        var self = this;
        var processTokens = this._processTokens;
        var onceCache = this._onceCache;
        var methods = this._methods;
        for (var i = 0; i < this._pendingPromises.length; i++) {
            var item = this._pendingPromises[i];
            (function(p) {
                // 辅助函数：通过 data-path 属性精确匹配 s-await 元素（比 CSS 选择器更可靠）
                var findAwaitEls = function() {
                    var result = [];
                    if (!self._root) return result;
                    var allAwaits = self._root.querySelectorAll('s-await');
                    for (var ai = 0; ai < allAwaits.length; ai++) {
                        if (allAwaits[ai].getAttribute('data-path') === p.awaitExpr) {
                            result.push(allAwaits[ai]);
                        }
                    }
                    return result;
                };

                var showFinally = function() {
                    if (!self._root) return;
                    var awaitEls = findAwaitEls();
                    for (var ai = 0; ai < awaitEls.length; ai++) {
                        var awaitEl = awaitEls[ai];
                        var finallyBranch = awaitEl.querySelector('[data-state="finally"]');
                        if (finallyBranch) {
                            // 重新渲染 finally 内容（使其能访问 then/catch 变量）
                            if (p.finallyTokens && p.finallyTokens.length > 0) {
                                var finallyCtx = {};
                                for (var k in self._data) { if (self._data.hasOwnProperty(k)) finallyCtx[k] = self._data[k]; }
                                if (p.thenVar && self._data[p.thenVar] !== undefined) finallyCtx[p.thenVar] = self._data[p.thenVar];
                                if (p.catchVar && self._data[p.catchVar] !== undefined) finallyCtx[p.catchVar] = self._data[p.catchVar];
                                finallyBranch.innerHTML = processTokens(p.finallyTokens, 0, finallyCtx, onceCache, null, methods);
                            }
                            finallyBranch.style.display = '';
                            self._queryCache.clear();
                        }
                    }
                };

                p.promise.then(function(resolved) {
                    if (!self._root) return;
                    // 回写 data，触发响应式更新
                    if (p.thenVar) {
                        self._data[p.thenVar] = resolved;
                    }
                    var awaitEls = findAwaitEls();
                    for (var ai = 0; ai < awaitEls.length; ai++) {
                        var awaitEl = awaitEls[ai];
                        var loadingBranch = awaitEl.querySelector('[data-state="loading"]');
                        var thenBranch = awaitEl.querySelector('[data-state="then"]');
                        var catchBranch = awaitEl.querySelector('[data-state="catch"]');
                        if (thenBranch && loadingBranch) {
                            var thenCtx = {};
                            for (var k in self._data) { if (self._data.hasOwnProperty(k)) thenCtx[k] = self._data[k]; }
                            if (p.thenVar) thenCtx[p.thenVar] = resolved;
                            thenBranch.innerHTML = processTokens(p.thenTokens, 0, thenCtx, onceCache, null, methods);
                            loadingBranch.style.display = 'none';
                            thenBranch.style.display = '';
                            if (catchBranch) catchBranch.style.display = 'none';
                            self._queryCache.clear();
                        }
                    }
                    // 触发响应式更新，让其他绑定也感知到数据变化
                    if (!self._updating) self.update();
                }).catch(function(err) {
                    if (!self._root) return;
                    // 回写 error 到 data
                    if (p.catchVar) {
                        self._data[p.catchVar] = err;
                    }
                    var awaitEls = findAwaitEls();
                    for (var ai = 0; ai < awaitEls.length; ai++) {
                        var awaitEl = awaitEls[ai];
                        var loadingBranch = awaitEl.querySelector('[data-state="loading"]');
                        var thenBranch = awaitEl.querySelector('[data-state="then"]');
                        var catchBranch = awaitEl.querySelector('[data-state="catch"]');
                        if (catchBranch && loadingBranch) {
                            var catchCtx = {};
                            for (var k in self._data) { if (self._data.hasOwnProperty(k)) catchCtx[k] = self._data[k]; }
                            if (p.catchVar) catchCtx[p.catchVar] = err;
                            catchBranch.innerHTML = processTokens(p.catchTokens, 0, catchCtx, onceCache, null, methods);
                            loadingBranch.style.display = 'none';
                            catchBranch.style.display = '';
                            if (thenBranch) thenBranch.style.display = 'none';
                            self._queryCache.clear();
                        }
                    }
                    // 触发响应式更新，让其他绑定也感知到数据变化
                    if (!self._updating) self.update();
                }).finally(function() {
                    // finally 始终执行，无论成功或失败
                    showFinally();
                });
            })(item);
        }
        this._pendingPromises = [];
    };

    // 响应式触发单个 await（变量从空变为有效值时调用）
    ShadowIt.prototype._triggerAwait = function(ab, awaitVal, data) {
        var self = this;
        if (!ab.tokens) return;
        var awaitParts = utils._splitAwaitBranchesTokens(ab.tokens);
        var awaitExpr = ab.expr || ab.path;

        // 变量是字符串 → 当作 URL fetch
        if (typeof awaitVal === 'string') {
            awaitVal = fetch(awaitVal).then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            });
        }
        // 变量是函数 → 调用它
        else if (typeof awaitVal === 'function') {
            var fnResult = awaitVal();
            awaitVal = (fnResult && typeof fnResult.then === 'function') ? fnResult : fnResult;
        }

        if (awaitVal && typeof awaitVal.then === 'function') {
            this._pendingPromises.push({
                promise: awaitVal,
                awaitExpr: ab.path,
                awaitRawExpr: awaitExpr,
                thenTokens: awaitParts.then,
                thenVar: awaitParts.thenVar,
                catchTokens: awaitParts.catch,
                catchVar: awaitParts.catchVar,
                finallyTokens: awaitParts.finally
            });
            this._resolvePendingPromises();
        }
    };

    // ----- 错误处理（美化） -----

    ShadowIt.prototype._handleError = function(err, context) {
        try {
            var msg = err && err.message ? err.message : String(err);
            var stack = err && err.stack ? err.stack : '(no stack)';
            console.groupCollapsed('[shadowit] ' + (this._name || this._id) + ' - ' + context);
            console.error(msg);
            if (stack) console.log(stack);
            console.groupEnd();
            if (utils.isFunction(this.options.onError)) {
                this.options.onError(err, context);
            }
        } catch (e) {
            console.error('[shadowit] onError 自身执行失败:', e && e.message ? e.message : e);
        }
    };

    // ----- 调度更新 -----

    ShadowIt.prototype._scheduleUpdate = function() {
        if (this._updating || this._updateScheduled) return;
        var self = this;
        this._updateScheduled = true;
        requestAnimationFrame(function() {
            self._updateScheduled = false;
            self.update();
        });
    };

    // ----- CSS -----

    ShadowIt.prototype._applyCSS = function() {
        if (!this._root) return this;
        var oldStyles = this._root.querySelectorAll('style[data-shadowit]');
        for (var i = 0; i < oldStyles.length; i++) oldStyles[i].remove();
        var cssVal = this.options.css;
        if (utils.isFunction(cssVal)) cssVal = cssVal(this._data);
        if (cssVal) {
            var styleEl = document.createElement('style');
            styleEl.setAttribute('data-shadowit', this._id);
            styleEl.textContent = cssVal;
            this._root.prepend(styleEl);
        }
        return this;
    };

    // ----- MutationObserver -----

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

    // ----- destroy（含内存泄漏修复） -----

    ShadowIt.prototype.destroy = function() {
        if (this._destroyed) return this;
        if (this._groupInstances && this._groupInstances.length > 0) {
            for (var gi = 0; gi < this._groupInstances.length; gi++) {
                if (this._groupInstances[gi] && !this._groupInstances[gi]._destroyed) {
                    this._groupInstances[gi].destroy();
                }
            }
            this._groupInstances = null;
        }
        try { this._callHook('destroy', this._host, this); }
        catch (err) { this._handleError(err, 'destroy'); }
        if (this._delegatedEvents) { this._delegatedEvents.destroy(); this._delegatedEvents = null; }
        if (this._root) { this._root.innerHTML = ''; this._root = null; }
        if (this._host) { shadowit._instances.delete(this._host); }
        if (this._name && shadowit._nameMap[this._name] === this) { delete shadowit._nameMap[this._name]; }
        this._host = null;
        this._destroyed = true;
        this._mounted = false;
        this._rendered = false;

        // 内存泄漏修复
        this._queryCache.clear();
        this._queryCache = null;
        this._bindings = null;
        this._onceCache = null;
        this._pendingPromises = null;

        return this;
    };

    // ===== Module 6: Global API =====

    // 全局查询
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

    // 批处理更新（带去重）
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

    // 全局 shadowit 函数
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
                        setup: function() {
                            var flat = {};
                            var cloned = utils.deepClone(firstInst._data);
                            for (var dk in cloned) { if (cloned.hasOwnProperty(dk)) flat[dk] = cloned[dk]; }
                            for (var mk in firstInst._methods) { if (firstInst._methods.hasOwnProperty(mk)) flat[mk] = firstInst._methods[mk]; }
                            flat.computed = firstInst._computed;
                            return flat;
                        },
                        mode: firstInst.options.mode,
                        onError: firstInst.options.onError,
                        eventsOnHost: firstInst.options.eventsOnHost,
                        beforeRender: firstInst._hooks.beforeRender,
                        afterRender: firstInst._hooks.afterRender,
                        beforeUpdate: firstInst._hooks.beforeUpdate,
                        afterUpdate: firstInst._hooks.afterUpdate,
                        shouldUpdate: firstInst._hooks.shouldUpdate,
                        destroy: firstInst._hooks.destroy
                    });
                    firstInst._groupInstances.push(clone);
                }
                return firstInst;
            }
            return new ShadowIt(null, opts);
        }

        // ---- sdit([...]) / sdit([...], {}) 数组多宿主 ----
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
                    setup: function() {
                        var flat = {};
                        var cloned = utils.deepClone(firstInst._data);
                        for (var dk in cloned) { if (cloned.hasOwnProperty(dk)) flat[dk] = cloned[dk]; }
                        for (var mk in firstInst._methods) { if (firstInst._methods.hasOwnProperty(mk)) flat[mk] = firstInst._methods[mk]; }
                        flat.computed = firstInst._computed;
                        return flat;
                    },
                    mode: firstInst.options.mode,
                    onError: firstInst.options.onError,
                    eventsOnHost: firstInst.options.eventsOnHost,
                    beforeRender: firstInst._hooks.beforeRender,
                    afterRender: firstInst._hooks.afterRender,
                    beforeUpdate: firstInst._hooks.beforeUpdate,
                    afterUpdate: firstInst._hooks.afterUpdate,
                    shouldUpdate: firstInst._hooks.shouldUpdate,
                    destroy: firstInst._hooks.destroy
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

        // ---- sdit(selector, templateEl, css) 快速创建：selector挂载 + templateEl子元素为模板 ----
        if (utils.isString(host) && arguments.length >= 2) {
            var arg1 = arguments[0], arg2 = arguments[1], arg3 = arguments[2];
            // 新快捷：sdit(selector, templateEl, css) — 3 参数，arg2 是 Element
            if (arg2 instanceof Element && arguments.length >= 3) {
                var tplHtml = arg2.innerHTML;
                arg2.innerHTML = '';
                var fastOpts = { template: tplHtml };
                if (utils.isString(arg3)) fastOpts.css = arg3;
                var h = utils.resolveHost(arg1);
                if (h) return new ShadowIt(h, fastOpts);
                if (utils.isString(arg1)) {
                    var inst = new ShadowIt(null, fastOpts);
                    inst._pendingSelector = arg1; inst._startObserver(); return inst;
                }
                return new ShadowIt(arg2, fastOpts);
            }

        // ---- 旧版兼容：字符串简写 ----
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

    shadowit.version = '2.0.0';
    shadowit.utils = utils;
    shadowit.ShadowIt = ShadowIt;
    shadowit.isSupported = isSupported;

    // 实例管理
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
                    var name = node.getAttribute('data-s-name') || node.id ||
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
        wrapper.setAttribute('data-s-copy', '');
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

    // takeOver
    var _takeOver = false, _origAttachShadow = null, _hijackInstalled = false;

    function _installHijack() {
        if (_hijackInstalled) return;
        _hijackInstalled = true;
        _origAttachShadow = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function(init) {
            var root = _origAttachShadow.call(this, init);
            if (_takeOver && init && init.mode === 'open') {
                if (!shadowit._instances.has(this)) {
                    var name = this.getAttribute('data-s-name') || this.id ||
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

    // 自定义标签注册
    shadowit.define = function(name, tpl, css) {
        // ---- sdit.define({name: "my-counter", ...}) 单对象形式 ----
        if (name && typeof name === 'object' && !utils.isString(name) && !utils.isArray(name)) {
            var opts = name;
            var tagName = opts.name;
            if (!tagName) throw new Error('[shadowit] define() 需要 name 属性指定标签名');
            return shadowit._define(tagName, opts);
        }
        // ---- sdit.define("my-counter", "template", "css") 字符串简写 ----
        if (utils.isString(tpl) && !utils.isObject(arguments[1])) {
            var opts = { template: tpl };
            if (css) opts.css = css;
            return shadowit._define(name, opts);
        }
        // ---- sdit.define("my-counter", { template: "...", setup: ... }) 完整形式 ----
        return shadowit._define(name, tpl || {});
    };

    shadowit._define = function(tagName, options) {
        if (!tagName.includes('-')) throw new Error('[shadowit] 自定义标签名必须包含中划线 "-"');

        var template = options.template || '';
        var el = options.el || null;
        var cssVal = options.css || options.styles || '';
        var setupFn = options.setup || null;
        var setupResult = utils.isFunction(setupFn) ? setupFn() : {};
        var initialData = {};
        var setupMethods = {};
        var setupComputed = {};
        for (var dk in setupResult) {
            if (setupResult.hasOwnProperty(dk)) {
                if (dk === 'computed' && utils.isObject(setupResult[dk])) {
                    setupComputed = setupResult[dk];
                } else if (utils.isFunction(setupResult[dk])) {
                    setupMethods[dk] = setupResult[dk];
                } else {
                    initialData[dk] = setupResult[dk];
                }
            }
        }
        var mode = options.mode || 'open';
        var delegatesFocus = options.delegatesFocus;
        var clonable = options.clonable;
        var serializable = options.serializable;
        var slotAssignment = options.slotAssignment;
        var customElementRegistry = options.customElementRegistry;
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
            for (var key in initialData) { if (initialData.hasOwnProperty(key)) self._data[key] = initialData[key]; }
            self._instanceName = cname || (tagName + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4));
            self._attributeChangedHandler = attributeChanged;
            self._template = template; self._css = cssVal; self._mode = mode;
            self._delegatesFocus = delegatesFocus;
            self._clonable = clonable;
            self._serializable = serializable;
            self._slotAssignment = slotAssignment;
            self._customElementRegistry = customElementRegistry;
            self._setupMethods = setupMethods;
            self._setupComputed = setupComputed;
            self._templateEl = el;
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
            // 如果指定了 el，用它（选择器或元素）的子元素 HTML 作为模板
            var tpl = this._template;
            if (this._templateEl && !tpl) {
                var templateSource = utils.isString(this._templateEl) ? document.querySelector(this._templateEl) : this._templateEl;
                if (templateSource) {
                    tpl = templateSource.innerHTML;
                    templateSource.innerHTML = '';
                }
            }
            var shadowitInst = shadowit(this, {
                template: tpl, css: this._css, mode: this._mode,
                delegatesFocus: this._delegatesFocus,
                clonable: this._clonable,
                serializable: this._serializable,
                slotAssignment: this._slotAssignment,
                customElementRegistry: this._customElementRegistry,
                setup: function() {
                    var flat = {};
                    for (var dk in self._data) { if (self._data.hasOwnProperty(dk)) flat[dk] = self._data[dk]; }
                    for (var mk in setupMethods) { if (setupMethods.hasOwnProperty(mk)) flat[mk] = setupMethods[mk]; }
                    flat.computed = setupComputed;
                    return flat;
                },
                name: this._instanceName,
                onError: onError, eventsOnHost: eventsOnHost,
                beforeRender: options.beforeRender ? function() { options.beforeRender.call(shadowitInst, self, shadowitInst); } : null,
                afterRender: options.afterRender ? function(data) { options.afterRender.call(shadowitInst, data, self, shadowitInst); } : null,
                beforeUpdate: options.beforeUpdate ? function(newData, oldData) { options.beforeUpdate.call(shadowitInst, newData, oldData, self, shadowitInst); } : null,
                afterUpdate: options.afterUpdate ? function(newData, currentData) { options.afterUpdate.call(shadowitInst, newData, currentData, self, shadowitInst); } : null,
                shouldUpdate: options.shouldUpdate ? function(newData, mergedData) { options.shouldUpdate.call(shadowitInst, newData, mergedData, self, shadowitInst); } : null,
                destroy: options.destroy ? function() { options.destroy.call(shadowitInst, self, shadowitInst); } : null
            });
            this._instance = shadowitInst;
            if (connected) connected.call(shadowitInst, self, shadowitInst);
        };

        ShadowItElement.prototype.disconnectedCallback = function() {
            var inst = this._instance;
            if (inst) { inst.destroy(); this._instance = null; }
            if (disconnected) disconnected.call(inst, this, inst);
        };

        ShadowItElement.prototype.attributeChangedCallback = function(attrName, oldVal, newVal) {
            if (oldVal === newVal) return;
            if (this._attributeChangedHandler) {
                var self = this;
                setTimeout(function() {
                    self._attributeChangedHandler.call(self._instance, attrName, oldVal, newVal, self, self._instance);
                }, 0);
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