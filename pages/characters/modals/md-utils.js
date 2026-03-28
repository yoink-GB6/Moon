// pages/characters/modals/md-utils.js
// Markdown ↔ section 数据结构转换工具
// 独立文件，避免 character-modal ↔ country-modal ↔ geo-detail 循环依赖

/**
 * textarea 内容（支持 # ## ###）→ { content, children } 结构
 */
export function mdToChildren(text) {
  if (!text || !text.trim()) return { content: '', children: [] };
  const lines = text.split('\n');
  let topContent = '';
  const children = [];
  let cur = null;
  let cur2 = null;
  let cur3 = null;

  function flushCur3() {
    if (cur3) {
      if (cur2) cur2.children.push(cur3);
      else if (cur) cur.children.push(cur3);
      cur3 = null;
    }
  }
  function flushCur2() {
    flushCur3();
    if (cur2) {
      if (cur) cur.children.push(cur2);
      cur2 = null;
    }
  }
  function flushCur() {
    flushCur2();
    if (cur) { children.push(cur); cur = null; }
  }

  for (const line of lines) {
    const h3 = line.match(/^-[ \t]+(.+)/);
    const h2 = !h3 && line.match(/^##[ \t]+(.+)/);
    const h1 = !h3 && !h2 && line.match(/^#[ \t]+(.+)/);

    if (h1) {
      flushCur();
      cur = { title: h1[1].trim(), content: '', children: [] };
    } else if (h2) {
      flushCur2();
      cur2 = { title: h2[1].trim(), content: '', children: [] };
    } else if (h3) {
      flushCur3();
      cur3 = { title: h3[1].trim(), content: '' };
    } else {
      const target = cur3 || cur2 || cur;
      if (target) {
        target.content += (target.content ? '\n' : '') + line;
      } else {
        topContent += (topContent ? '\n' : '') + line;
      }
    }
  }
  flushCur();

  function trimContent(obj) {
    if (obj.content) obj.content = obj.content.trimEnd();
    if (obj.children) obj.children.forEach(trimContent);
  }
  children.forEach(trimContent);
  topContent = topContent.trimEnd();

  function cleanChildren(obj) {
    if (obj.children) {
      obj.children.forEach(cleanChildren);
      if (!obj.children.length) delete obj.children;
    }
  }
  children.forEach(cleanChildren);

  return { content: topContent, children: children.length ? children : undefined };
}

/**
 * section 对象 → textarea 文本（children 还原成 # ## ### 语法）
 */
export function childrenToMd(sec) {
  let out = sec.content || '';
  if (sec.children && sec.children.length) {
    sec.children.forEach(function(c) {
      if (out) out += '\n\n';
      out += '# ' + c.title;
      if (c.content) out += '\n' + c.content;
      if (c.children && c.children.length) {
        c.children.forEach(function(gc) {
          out += '\n\n## ' + gc.title;
          if (gc.content) out += '\n' + gc.content;
          if (gc.children && gc.children.length) {
            gc.children.forEach(function(ggc) {
              out += '\n\n- ' + ggc.title;
              if (ggc.content) out += '\n' + ggc.content;
            });
          }
        });
      }
    });
  }
  return out;
}
