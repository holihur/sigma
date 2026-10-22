# Figma 互通

Sigma 不解析封闭的 `.fig` 二进制，而提供两条可靠路径：

1. **Figma → Sigma**：Figma REST API 导入。
2. **Sigma → Figma**：Sigma JSON 导出 + 配套 Figma 开发插件。

## Figma → Sigma（REST）

### 准备 Token

Figma → Settings → Security → Personal access tokens。只读文件内容即可。

### 在 Sigma 导入

1. 文件面板 → **Import from Figma**。
2. 粘贴 Figma 文件 URL 或 file key。
3. 粘贴 Figma Personal Access Token。
4. 可选填写设计名称。
5. **Import design**。

后端调用：

```text
GET https://api.figma.com/v1/files/{key}?geometry=paths
X-Figma-Token: <token>
```

Token 只用于这次请求，不写入数据库。

### 转换规则

| Figma | Sigma |
| --- | --- |
| `FRAME` / `COMPONENT` / `INSTANCE` | `frame` |
| `GROUP` | `group`（零原点容器） |
| `RECTANGLE` / `VECTOR` / `STAR` / `POLYGON` | `rect` 近似 |
| `ELLIPSE` | `ellipse` |
| `TEXT` | `text`，保留 characters / font / align / line height |
| `LINE` | `line` |
| solid fill | 纯色，含 alpha |
| linear / radial gradient | Sigma 线性渐变近似 |
| strokes | 描边颜色与宽度 |
| corner radius | 圆角 |
| drop shadow / layer blur | 阴影 / 模糊 |
| clipContent | `clip` |
| 页面 | Sigma 页面 |

限制：

- Figma 自动布局转换为绝对坐标。
- 旋转角度按包围盒导入，不保证视觉完全一致。
- 图片 fill 目前转为占位灰底，不下载 Figma 私有图片。
- Figma 原型 reactions 不导入。
- 复杂布尔运算 / 矢量网络会近似为矩形；如需精确矢量，请在 Sigma 中用钢笔重绘。

## Sigma → Figma（插件）

### 导出

编辑器 → 账号菜单 → **Export Figma JSON**，得到：

```json
{
  "format": "sigma-figma-v1",
  "name": "Material 3",
  "doc": { "pages": [] }
}
```

### 安装插件

1. 打开 Figma 桌面端。
2. **Plugins → Development → Import plugin from manifest…**
3. 选择仓库中的 `figma-plugin/manifest.json`。
4. 运行 **Plugins → Development → Sigma Import**。
5. 选择或粘贴 `.sigma.json`，可过滤页面。
6. **Import into Figma**。

### 保留内容

- 页面、Frame、矩形、椭圆、文本、线条。
- 纯色 / 渐变、描边、圆角、透明度、旋转。
- 阴影、图层模糊、裁剪。
- 图片 URL（插件会尝试加载）。
- 字体：丢失时回退到 Inter。

### 简化处理

- Sigma 的 `group` 会被展开，保证坐标精确。
- Sigma 组件实例会作为普通图层导入，不带 Figma 组件关系。
- 原型链接不导入 Figma reactions。
- `.fig` 文件不能直接导入插件。

## 导入 Figma 插件 JSON

除了 REST，Sigma 也接受：

- `{"format":"sigma-figma-v1","name":"...","doc":{...}}`
- 原始 Sigma 文档 `{"pages":[...]}`
- Figma REST 响应 `{"document":{...}}`

入口：**Import from Figma → JSON / plugin**。

## 常见问题

| 问题 | 原因 |
| --- | --- |
| `403` / `Invalid token` | Figma Token 无文件访问权限或已过期 |
| 导入后字体变化 | 本地无对应字体，Sigma 回退 Inter |
| 渐变方向不完全一致 | Figma 渐变句柄与 CSS 角度是近似映射 |
| 图片空白 | Figma 图片 fill 未公开下载，导入为占位 |
| 插件报 `No pages[]` | 选错了文件；需要 Sigma 导出的 `.sigma.json`，不是 `.fig` |
