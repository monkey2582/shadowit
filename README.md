# ShadowIt

ShadowIt 是一个轻量级的 Shadow DOM 模板引擎，语法像 Vue，体积像 Alpine，封装像 Web Components。

无需构建工具，直接在浏览器中运行。

---

✨ 特性

· ✅ 类 Vue 模板语法：{{ }} 插值、#for of 列表渲染、#if/else 条件渲染
· ✅ #show 条件显示：比 #if 性能更好，频繁切换时只切换 display:none
· ✅ #once 一次性渲染：静态内容只渲染一次，后续更新直接复用缓存
· ✅ @事件 模板内绑定：<button @click="handler"> 无需手动 addEventListener
· ✅ 零构建：直接在浏览器中运行，无需 Webpack/Vite/PostCSS
· ✅ Shadow DOM 样式隔离：CSS 只作用于组件内部，不会污染全局
· ✅ 精细 DOM Diff：基于 data-key 的列表 diff，支持元素移动、插入、删除
· ✅ 自定义元素注册：sdit.define('my-el', template, css) 极简 API
· ✅ 轻量：压缩后约 15KB，无任何外部依赖

---

🚀 快速上手

1. 引入 CDN

```html
<script src="https://unpkg.com/shadowit"></script>
```

2. 定义一个组件

```html
<my-counter></my-counter>

<script>
  sdit.define('my-counter', `
    <button @click="dec">−</button>
    <span>{{ count }}</span>
    <button @click="inc">+</button>
  `, `
    button { background: #3b82f6; color: white; border: none; padding: 4px 16px; border-radius: 4px; cursor: pointer; }
    span { margin: 0 16px; font-size: 20px; min-width: 30px; display: inline-block; text-align: center; }
  `, {
    data: { count: 0 },
    methods: {
      inc() { this.update({ count: this.getData().count + 1 }); },
      dec() { this.update({ count: this.getData().count - 1 }); }
    }
  });
</script>
```

---

📖 模板语法

插值 {{ }}

```html
<div>{{ userName }}</div>
<div>{{ user.profile.age }}</div>
```

列表渲染 #for of

```html
{{#for item of items key="id"}}
  <li>{{ item.name }} - 索引: {{ index }}</li>
{{/for}}
```

· key="id" 用于 DOM diff 优化（可选，推荐）
· 内部可访问 {{ index }} 获取当前索引
· 支持 ../ 访问父级数据

条件渲染 #if / #else / #else-if

```html
{{#if user.isAdmin}}
  <span>管理员</span>
{{#else if user.isModerator}}
  <span>版主</span>
{{#else}}
  <span>普通用户</span>
{{/if}}
```

条件显示 #show（比 #if 性能更好）

```html
{{#show isVisible}}
  <div class="panel">这个元素在隐藏时依然保留在 DOM 中，只是 display:none</div>
{{/show}}
```

一次性渲染 #once（静态内容缓存）

```html
{{#once}}
  <div class="static-help">这个内容只渲染一次，数据变化不会更新</div>
{{/once}}
```

事件绑定 @事件名

```html
<button @click="handleClick">点击</button>
<input @input="handleInput" />
<div @mouseenter="onEnter">悬停</div>
```

事件处理函数可以定义在 data 或 methods 中：

```javascript
sdit('#app', {
  template: `<button @click="sayHi">点击</button>`,
  data: {
    sayHi(e, el) { alert('你好！'); }
  }
});
```

注释 {{-- --}}

```html
{{-- 这行不会出现在渲染结果中 --}}
<div>可见内容</div>
```

---

🔧 API 参考

sdit(host, options) / sdit(template, css, host)

创建 ShadowIt 实例。

```javascript
// 传统方式
const app = sdit('#app', {
  template: `<div>{{ msg }}</div>`,
  css: `div { color: red; }`,
  data: { msg: 'Hello' }
});

// 快捷方式
const app = sdit(`<div>{{ msg }}</div>`, `div { color: red; }`, '#app');

// 延迟挂载（元素尚未出现在 DOM 中）
const app = sdit('#future-element', {
  template: `<div>自动挂载</div>`
});
```

sdit.define(name, template, css, options)

注册自定义元素（Web Component）。

```javascript
sdit.define('my-button', `
  <button @click="onClick">{{ label }}</button>
`, `
  button { background: blue; color: white; padding: 8px 16px; border: none; border-radius: 4px; }
`, {
  data: { label: 'Click me' },
  methods: {
    onClick(e, el) { alert(' clicked!'); }
  }
});
```

返回代理对象，支持链式调用：

```javascript
const MyButton = sdit.define('my-button', template, css, options);
MyButton.data({ label: 'New Label' });
MyButton.on('click', 'button', () => {});
MyButton.destroy();
```

sdit.copy(source, target) / clipboard.paste(dest)

复制 Shadow DOM 元素到目标位置。

```javascript
const clipboard = sdit.copy('#source');
clipboard.paste('#target');
```

sdit.scan(root)

扫描指定根节点下所有 Shadow DOM，挂载到 sdit.instance。

```javascript
sdit.scan(document.body);
```

sdit.remove(name, root) / sdit.removeAll(root)

删除指定或全部 ShadowIt 实例。

```javascript
sdit.remove('my-instance', document.body);
sdit.removeAll('#app');
```

sdit.querySelector(selector, root) / sdit.querySelectorAll(selector, root)

全局查询，支持穿透 Shadow DOM。

```javascript
const el = sdit.querySelector('.btn', document.body);
const all = sdit.querySelectorAll('.item', '#app');
```

sdit.batchUpdate(instance, data)

批量更新，多个数据变化合并为一次渲染。

```javascript
sdit.batchUpdate(app, { count: 1 });
sdit.batchUpdate(app, { count: 2 }); // 只渲染一次
```

---

📦 安装

CDN

```html
<script src="https://cdn.jsdelivr.com/gh/monkey2582/shadowit/shadowit.min.js"></script>
```

npm

```bash
npm install shadowit
```

```javascript
import sdit from 'shadowit';
// 或
const sdit = require('shadowit');
```

---

📊 对比

特性 ShadowIt Vue Lit Alpine.js
构建工具 ❌ 不需要 ⚠️ 推荐 ❌ 不需要 ❌ 不需要
Shadow DOM ✅ 原生 ❌ ✅ 原生 ❌
模板语法 {{ }} #for #if {{ }} v-for v-if html 模板字符串 x-for x-if
事件绑定 @click @click 手动 @click
体积 ~15KB ~30KB+ ~16KB ~15KB
自定义元素 ✅ 原生 ❌ ✅ 原生 ❌
列表 diff ✅ 按 key ✅ 按 key ❌ 全量替换 ❌ 全量替换

---

🌐 浏览器兼容性

- Chrome 70+
- Firefox 63+
- Safari 12+
- Edge 79+

---

📄 License

MIT
