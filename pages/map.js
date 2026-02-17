// pages/map.js
// 地图页面占位模块
// 当路由配置中 placeholder: true 时，router 会自动显示占位页面，无需 mount
// 此文件仅在未来实现地图功能时填充

export async function mount(container) {
  container.innerHTML = `
    <div class="page-placeholder">
      <div class="placeholder-icon">🗺</div>
      <h2>地图页面</h2>
      <p>此功能正在开发中。<br>将支持添加地点、国家名称、坐标和标记大小。<br>数据存储在 Supabase <code>map_locations</code> 表中。</p>
    </div>
  `;
}

export function unmount() {}
