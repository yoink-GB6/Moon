// pages/characters/html-render.js
// 自定义人物介绍 HTML：消毒 + shadow DOM 挂载

// characters 表 anon 可写，这一列的内容不可信。
// innerHTML 本身不执行 <script>，但 <img onerror> 之类照样跑，所以 on* 必须剥掉。
const DROP_TAGS = ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base'];
const URL_ATTRS = ['href', 'src', 'xlink:href'];
const BAD_URL   = /^\s*(javascript:|data:text\/html)/i;

const BASE_CSS =
  ':host{display:block}' +
  '*{box-sizing:border-box}' +
  'img{max-width:100%;height:auto}' +
  'a{color:var(--accent);text-decoration:none}';

// 现成的人物介绍常常整段裹在 ```html … ``` 里，存和渲染都把这层剥掉。
// 一份稿子里可能有好几段各自成对的围栏，只剥最外层会把中间那些留成可见文字，
// 所以认准“开头就是围栏”之后，把所有独占一行的围栏标记全删掉。
const FENCE_LINE = /^[ \t]*```[a-zA-Z0-9+#-]*[ \t]*$/;

export function stripCodeFence(s) {
  const t = (s || '').trim();
  if (!t.startsWith('```')) return t;
  return t.split(/\r?\n/).filter(function(line) { return !FENCE_LINE.test(line); }).join('\n').trim();
}

export function hasCustomHtml(char) {
  return !!(char && stripCodeFence(char.description_html));
}

function sanitize(html) {
  // 用 template 而不是 DOMParser：内容是惰性的（脚本不跑、图片不加载），
  // 而且不会把开头的 <style> 拆进 <head> 丢掉
  const tpl = document.createElement('template');
  tpl.innerHTML = stripCodeFence(html);
  const frag = tpl.content;
  frag.querySelectorAll(DROP_TAGS.join(',')).forEach(function(el) { el.remove(); });
  frag.querySelectorAll('*').forEach(function(el) {
    Array.from(el.attributes).forEach(function(attr) {
      const name = attr.name.toLowerCase();
      if (name.indexOf('on') === 0) el.removeAttribute(attr.name);
      else if (URL_ATTRS.indexOf(name) !== -1 && BAD_URL.test(attr.value)) el.removeAttribute(attr.name);
    });
  });
  return frag;
}

export function mountCharHtml(hostEl, html) {
  const root = hostEl.attachShadow({ mode: 'open' });
  // CSS 自定义属性是继承属性，会穿透 shadow 边界，
  // 所以自定义 HTML 里直接写 var(--accent) 就能跟随主题
  const base = document.createElement('style');
  base.textContent = BASE_CSS;
  root.appendChild(base);
  root.appendChild(sanitize(html));
  return root;
}
