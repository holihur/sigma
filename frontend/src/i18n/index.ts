import { create } from "zustand";

export type Locale = "en" | "zh";

const zh: Record<string, string> = {
  // Common
  "Sign in": "登录",
  "Sign up": "注册",
  "Sign out": "退出登录",
  "Email": "邮箱",
  "Password": "密码",
  "Name": "名称",
  "Create account": "创建账号",
  "Cancel": "取消",
  "Save": "保存",
  "Close": "关闭",
  "Delete": "删除",
  "Rename": "重命名",
  "Duplicate": "复制",
  "Copy": "复制",
  "Paste": "粘贴",
  "Share": "分享",
  "Present": "演示",
  "Open": "打开",
  "Edit": "编辑",
  "Search": "搜索",
  "Loading…": "加载中…",
  "All designs": "全部设计",
  "Starred": "已收藏",
  "Shared with me": "共享给我",
  "Templates": "模板",
  "New design": "新建设计",
  "Designs": "设计",
  "Shared": "共享",
  "Recent designs": "最近设计",
  "Starred designs": "收藏的设计",
  "Shared with you": "共享给你",
  "You": "你",
  "Owner": "所有者",
  "Can edit": "可编辑",
  "Can view": "仅查看",
  "View only": "仅查看",
  "Open in editor": "在编辑器中打开",
  "Delete design": "删除设计",
  "Collaborators": "协作者",
  "Type “{name}” to confirm": "输入“{name}”以确认",
  "Rename design": "重命名设计",
  "Create design": "创建设计",
  "Design name": "设计名称",
  "Blank canvas": "空白画布",
  "Sigma Signal": "Sigma Signal",
  "Sigma's own mobile language: paper, ink, cobalt and acid with hard borders and editorial type.":
    "Sigma 自有移动端语言：纸感、墨黑、钴蓝与酸性绿，硬边框和编辑感排版。",
  "Field Notes": "Field Notes",
  "An editorial website with oversized type, offset shadows and a single acid highlight.":
    "编辑感网站：超大字号、偏移实色阴影和单一酸性绿高亮。",
  "Atlas Ops": "Atlas Ops",
  "A dark operational dashboard built on ink panels, acid signals and cobalt data.":
    "深色运维仪表盘：墨黑面板、酸性绿告警和钴蓝数据。",
  "Material Design 3": "Material Design 3",
  "Material You color roles, Roboto type scale, expressive cards, FAB and navigation bar.":
    "Material You 色彩角色、Roboto 字阶、表现力卡片、FAB 与导航栏。",
  "Apple HIG": "Apple HIG",
  "iOS grouped settings, SF Pro typography, switches, tab bar and Human Interface colors.":
    "iOS 分组设置、SF Pro 字体、开关、标签栏与人机界面色彩。",
  "Microsoft Fluent 2": "Microsoft Fluent 2",
  "Fluent command bar, navigation, metric cards and a data table with Segoe UI styling.":
    "Fluent 命令栏、导航、指标卡片与 Segoe UI 风格数据表。",
  "IBM Carbon": "IBM Carbon",
  "Carbon UI shell, side navigation, data table and productive IBM Plex Sans components.":
    "Carbon UI 外壳、侧边导航、数据表与 IBM Plex Sans 生产力组件。",
  "Last updated": "最近更新",
  "Date created": "创建日期",
  "Switch to light theme": "切换到浅色主题",
  "Switch to dark theme": "切换到深色主题",
  "Light theme": "浅色主题",
  "Dark theme": "深色主题",

  // Login
  "Welcome back": "欢迎回来",
  "Create your account": "创建你的账号",
  "Sign in to keep designing with your team.": "登录后继续与团队一起设计。",
  "Start prototyping in less than a minute.": "一分钟内开始制作原型。",
  "At least 6 characters": "至少 6 个字符",
  "or": "或",
  "Explore the demo workspace": "体验演示工作区",
  "Continue with {provider}": "使用 {provider} 继续",
  "Single sign-on": "单点登录",
  "Signed in": "登录成功",
  "Demo account:": "演示账号：",
  "By continuing you agree to the Sigma terms of service and privacy policy.":
    "继续即表示你同意 Sigma 的服务条款和隐私政策。",
  "Design at the speed of thought.": "让设计跟上思考速度。",
  "A collaborative canvas for high-fidelity interfaces. Prototype real flows, share a link, and iterate together in real time.":
    "面向高保真界面的协作画布。制作真实可点击流程，分享链接，实时共同迭代。",
  "Built for product teams": "为产品团队打造",
  "Welcome to the demo workspace": "欢迎来到演示工作区",
  "Demo Designer": "演示设计师",
  "Enter a valid email address": "请输入有效的邮箱地址",
  "Password must be at least 6 characters": "密码至少需要 6 个字符",

  // Editor shell
  "Saved": "已保存",
  "Saving…": "保存中…",
  "Offline": "离线",
  "Undo": "撤销",
  "Redo": "重做",
  "Pages & layers": "页面与图层",
  "Properties": "属性",
  "Comments": "评论",
  "Account menu": "账号菜单",
  "Keyboard shortcuts": "键盘快捷键",
  "Version history": "版本历史",
  "Duplicate file": "复制文件",
  "Back to files": "返回文件列表",
  "Shared prototype": "公开原型",
  "Public prototype · read only": "公开原型 · 只读",
  "Prototype presentation": "原型演示",
  "Made with Sigma": "由 Sigma 制作",

  // Toolbar
  "Move": "移动",
  "Hand tool": "手型工具",
  "Frame": "画板",
  "Rectangle": "矩形",
  "Ellipse": "椭圆",
  "Line": "直线",
  "Text": "文本",
  "Place image": "插入图片",
  "Comment": "评论",
  "Hand / pan": "手型 / 平移",

  // Layers
  "Pages": "页面",
  "Layers": "图层",
  "Add page": "添加页面",
  "No layers yet.": "还没有图层。",
  "Press F and drag on the canvas to add a frame.": "按 F 并在画布上拖拽以添加画板。",
  "Group selection": "编组",
  "Ungroup": "取消编组",
  "Bring to front": "移到最前",
  "Send to back": "移到最后",
  "Bring forward": "前移一层",
  "Send backward": "后移一层",
  "Lock": "锁定",
  "Unlock": "解锁",
  "Hide": "隐藏",
  "Show": "显示",
  "Delete page": "删除页面",
  "Rename page": "重命名页面",
  "Drop here to move to canvas root": "拖到这里移动到画布根层级",

  // Properties
  "Page": "页面",
  "Document": "文档",
  "Tips": "提示",
  "File": "文件",
  "Layers on this page": "本页图层数",
  "Position & size": "位置与尺寸",
  "Appearance": "外观",
  "Opacity": "不透明度",
  "Blur": "模糊",
  "Fill": "填充",
  "Text color": "文字颜色",
  "Type": "类型",
  "Solid": "纯色",
  "Linear gradient": "线性渐变",
  "Stroke": "描边",
  "No stroke": "无描边",
  "Effects": "效果",
  "No effects": "无效果",
  "Typography": "排版",
  "Image": "图片",
  "Fit": "适应",
  "Cover": "覆盖",
  "Contain": "包含",
  "Fill image": "填充",
  "Replace image": "替换图片",
  "Export": "导出",
  "Copy as PNG": "复制为 PNG",
  "Nothing selected": "未选择图层",
  "Selection": "选区",
  "Align left": "左对齐",
  "Align horizontal centers": "水平居中对齐",
  "Align right": "右对齐",
  "Align top": "顶部对齐",
  "Align vertical centers": "垂直居中对齐",
  "Align bottom": "底部对齐",
  "Distribute horizontal spacing": "水平分布",
  "Distribute vertical spacing": "垂直分布",
  "Clip content": "裁剪内容",

  // Prototype
  "Prototype": "原型",
  "Interaction": "交互",
  "On click": "点击时",
  "No interaction": "无交互",
  "Navigate to frame": "跳转到画板",
  "Back": "返回",
  "Open URL": "打开 URL",
  "Target": "目标",
  "URL": "URL",
  "Animation": "动画",
  "Instant": "立即",
  "Dissolve": "溶解",
  "Slide left": "向左滑动",
  "Slide up": "向上滑动",
  "Present current page": "演示当前页面",
  "Start prototype from this frame": "从此画板开始演示",
  "Hotspots in frame": "画板内热区",
  "Hotspots": "热区",
  "Links": "链接",
  "No outgoing link": "没有跳转链接",
  "Choose target": "选择目标",
  "Choose frame…": "选择画板…",

  // Comments
  "Resolved": "已解决",
  "This page": "本页",
  "All pages": "全部页面",
  "Add": "添加",
  "Resolve": "解决",
  "Reopen": "重新打开",
  "No open comments": "没有未解决评论",
  "Nothing resolved yet": "还没有已解决评论",
  "New comment": "新评论",
  "Leave feedback…": "留下反馈…",
  "Post": "发布",
  "Click canvas to comment": "点击画布添加评论",
  "Comment added": "评论已添加",
  "Comment resolved": "评论已解决",
  "Comment reopened": "评论已重新打开",
  "Comment deleted": "评论已删除",

  // Share
  "Share ": "分享 ",
  "Invite teammates to edit or review this design. Collaborators need a Sigma account.":
    "邀请团队成员编辑或审阅此设计。协作者需要拥有 Sigma 账号。",
  "Invite": "邀请",
  "People with access": "可访问成员",
  "No collaborators yet. Invite someone by email.": "还没有协作者。通过邮箱邀请成员。",
  "Editor link": "编辑器链接",
  "Public prototype": "公开原型",
  "Anyone with the link can view the click-through prototype, no account needed.":
    "任何获得链接的人都可以查看可点击原型，无需账号。",
  "Live": "已开启",
  "Copy link": "复制链接",
  "Copied": "已复制",
  "Collaborator added": "已添加协作者",
  "Removed collaborator": "已移除协作者",
  "Public prototype enabled": "公开原型已开启",
  "Public link disabled": "公开链接已关闭",
  "Public link copied": "公开链接已复制",

  // Versions
  "Save checkpoints as you design, then restore any version later.": "设计过程中保存快照，之后可随时恢复。",
  "Name this version (optional)": "为此版本命名（可选）",
  "Save version": "保存版本",
  "No saved versions yet.": "还没有保存的版本。",
  "Save one above before making big changes.": "进行较大修改前先保存一个版本。",
  "Restore": "恢复",
  "Version saved": "版本已保存",
  "Read-only access": "只读访问",

  // Notifications
  "Notifications": "通知",
  "Could not mark notifications as read": "无法将通知标记为已读",
  "Comments and activity across your designs.": "你的设计中的评论与动态。",
  "You’re all caught up. New comments will show up here.": "已全部读完。新评论会出现在这里。",
  "commented on": "评论了",

  // Shortcuts
  "Work faster with the canvas at your fingertips.": "掌握快捷键，让画布操作更快。",
  "Tools": "工具",
  "View": "视图",
  "Arrange": "排列",
  "Duplicate selection": "复制图层",
  "Group": "编组",
  "Delete selection": "删除选中图层",
  "Pan canvas": "平移画布",
  "Zoom to fit": "适应画布",
  "Zoom to 100%": "缩放到 100%",
  "Fit page": "适应页面",
  "Nudge by 1px": "微调 1px",
  "Nudge by 10px": "微调 10px",
  "Zoom to selection": "缩放到选区",

  // Preview / public
  "Choose a frame": "选择画板",
  "No frame to present": "没有可演示的画板",
  "Draw a frame on the canvas, then present again.": "在画布上绘制一个画板，然后再次演示。",
  "Back to canvas": "返回画布",
  "Prototype unavailable": "原型不可用",
  "Open Sigma": "打开 Sigma",
  "Opening prototype…": "正在打开原型…",

  // Language
  "Language": "语言",
  "Switch to English": "切换到英文",
  "Switch to Chinese": "切换到中文",
  "English": "英文",
  "中文": "中文",

  "New": "新增",
  "Design": "设计",
  "AI assistant": "AI 助手",
  "AI settings": "AI 设置",
  "Personal settings": "个人中心",
  "Update how you appear to collaborators across Sigma.": "更新你在 Sigma 协作界面中的显示方式。",
  "Profile picture": "头像",
  "PNG, JPG, GIF or WebP. Uploaded to this Sigma instance.": "支持 PNG、JPG、GIF、WebP，上传到当前 Sigma 实例。",
  "Upload avatar": "上传头像",
  "Remove": "移除",
  "Display name": "用户名",
  "Shown on comments, cursors and collaborator lists.": "显示在评论、光标和协作者列表中。",
  "Profile color": "个人颜色",
  "Save profile": "保存个人资料",
  "Profile updated": "个人资料已更新",
  "Name must be between 2 and 60 characters": "用户名长度需在 2–60 个字符之间",
  "Design with Sigma AI": "用 Sigma AI 设计",
  "Describe a screen or a change in natural language. Sigma edits the canvas through real design tools.":
    "用自然语言描述一个页面或修改需求，Sigma 会通过真实设计工具直接修改画布。",
  "Configure your AI provider key": "配置你的 AI 服务商 Key",
  "Try": "试试",
  "Generate a clean login screen with email, password and a primary button":
    "生成一个简洁的登录页，包含邮箱、密码和主按钮",
  "Create a mobile onboarding flow with three steps and prototype links":
    "创建一个包含三步引导和原型跳转的移动端流程",
  "Restyle the selected layer with sky-blue accents and rounded corners":
    "把选中图层改成天蓝点缀与圆角风格",
  "Add a pricing section with three cards to this page": "在此页面添加一个包含三张卡片的价格区块",
  "Thinking and editing…": "正在思考并修改…",
  "Ask Sigma to design…": "让 Sigma 帮你设计…",
  "Configure a key to start…": "配置 Key 后开始…",
  "Enter to send · Shift+Enter for a new line": "Enter 发送 · Shift+Enter 换行",
  "AI edits are applied to the shared canvas and can be undone.": "AI 修改会应用到共享画布，也可以撤销。",
  "Bring your own AI provider key. Any OpenAI-compatible endpoint works; the key is encrypted at rest and never leaves this server.":
    "使用你自己的 AI 服务商 Key。支持任意 OpenAI-compatible 端点；Key 加密存储，不会离开服务器。",
  "Base URL must point at an OpenAI-compatible /v1 endpoint.": "Base URL 需要指向 OpenAI-compatible 的 /v1 端点。",
  "Custom / self-hosted": "自定义 / 自托管",
  "Any OpenAI-compatible /chat/completions endpoint": "任意 OpenAI-compatible /chat/completions 端点",
  "Local OpenAI-compatible endpoint": "本地 OpenAI-compatible 端点",
  "AI settings saved": "AI 设置已保存",

  // Developer / PAT / MCP
  "Developer & MCP": "开发者与 MCP",
  "Connect Claude, Cursor, or any MCP client to Sigma with a scoped personal access token.":
    "使用带权限范围的个人访问令牌，将 Claude、Cursor 或任意 MCP 客户端连接到 Sigma。",
  "MCP endpoint": "MCP 端点",
  "PATs only authenticate the MCP transport; regular app sessions still use your login token.":
    "PAT 仅用于 MCP 通道鉴权；常规应用会话仍使用登录令牌。",
  "New token": "新令牌",
  "Copy it now. The full token is never shown again.": "请立即复制。完整令牌只会显示这一次。",
  "Copy token": "复制令牌",
  "MCP config": "MCP 配置",
  "Copy config": "复制配置",
  "Personal access tokens": "个人访问令牌",
  "Token name": "令牌名称",
  "Token name is required": "请输入令牌名称",
  "Expires in days": "有效期（天）",
  "Read designs": "读取设计",
  "Edit designs": "编辑设计",
  "Create token": "创建令牌",
  "Choose at least one scope": "请至少选择一个权限",
  "No tokens yet": "还没有令牌",
  "Last used": "最近使用",
  "Never": "永不",
  "Expires": "过期时间",
  "Revoke": "撤销",
  "Token created": "令牌已创建",
  "Token revoked": "令牌已撤销",
  "MCP tools": "MCP 工具",
  "Copy failed": "复制失败",
  "Refresh": "刷新",
  "System update": "系统更新",
  "Auto · every {interval}": "自动 · 每 {interval}",
  "Check now": "立即检查",
  "Update now": "立即更新",
  "Latest": "最新版本",
  "Unknown": "未知",
  "Last checked": "最近检查",
  "Restart pending": "等待重启",
  "Update available": "有可用更新",
  "Update {version} installed. Sigma is restarting…": "已安装更新 {version}，Sigma 正在重启…",

  // Figma
  "Import from Figma": "从 Figma 导入",
  "Bring a Figma file in through the REST API, or import a Sigma JSON export.":
    "通过 Figma REST API 导入文件，或导入 Sigma JSON 导出包。",
  "Figma URL": "Figma 链接",
  "JSON / plugin": "JSON / 插件",
  "Figma file URL": "Figma 文件链接",
  "Personal access token": "个人访问令牌",
  "Figma → Settings → Security → Personal access tokens": "Figma → Settings → Security → Personal access tokens",
  "The token is used once for this import and is never stored by Sigma.": "令牌仅用于本次导入，Sigma 不会存储。",
  "Choose a .sigma.json file": "选择 .sigma.json 文件",
  "Exported from Sigma or produced by the Figma plugin": "来自 Sigma 导出或 Figma 插件",
  "…or paste JSON here": "…或在此粘贴 JSON",
  "Design name (optional)": "设计名称（可选）",
  "Use the file name": "使用文件名",
  "Import design": "导入设计",
  "Imported {count} layers across {pages} pages": "已导入 {pages} 个页面、{count} 个图层",
  "Enter a Figma file URL": "请输入 Figma 文件链接",
  "Enter a Figma personal access token": "请输入 Figma 个人访问令牌",
  "Choose or paste a Sigma JSON file": "请选择或粘贴 Sigma JSON 文件",
  "Imported design": "导入的设计",
  "JSON file is too large": "JSON 文件过大",
  "Could not read that file": "无法读取该文件",
  "Binary .fig files are not supported. Use the Figma REST API or the bundled Sigma plugin.":
    "不支持二进制 .fig 文件。请使用 Figma REST API 或内置 Sigma 插件。",
  "Export Figma JSON": "导出 Figma JSON",
  "Figma JSON exported": "Figma JSON 已导出",
  "Import SVG": "导入 SVG",
  "Imported {count} vector paths": "已导入 {count} 条矢量路径",
  "No vector paths found in this SVG": "此 SVG 中没有找到矢量路径",
  "Import": "导入",

  // Components / vector
  "Components": "组件",
  "Component": "组件",
  "Reusable components and their instances, scoped to this file.": "当前文件内的可复用组件及其实例。",
  "Turn “{name}” into a main component": "将“{name}”转换为主组件",
  "“{name}” is a main component": "“{name}”是主组件",
  "This selection is an instance of a component": "当前选择是组件实例",
  "Select one layer to create a component": "选择一个图层来创建组件",
  "Create": "创建",
  "{components} components · {instances} instances": "{components} 个组件 · {instances} 个实例",
  "No components yet. Select a frame and create your first component.": "还没有组件。选择一个画板并创建第一个组件。",
  "{count} instances": "{count} 个实例",
  "Update instances": "更新实例",
  "Updated {count} instances": "已更新 {count} 个实例",
  "Insert": "插入",
  "Other page": "其他页面",
  "Component created": "组件已创建",
  "Component instance inserted": "组件实例已插入",
  "Could not insert this component": "无法插入该组件",
  "Select a frame, group, or layer to turn into a component": "请选择画板、分组或图层来转换为组件",
  "Create component": "创建组件",
  "Detach instance": "分离实例",
  "Instances track their main component. Property edits inside a component update instances automatically; use Update instances after adding or deleting layers.":
    "实例会跟踪主组件。组件内部的属性修改会自动同步；新增或删除图层后请点击“更新实例”。",
  "Pen / vector": "钢笔 / 矢量",
  "A vector needs at least two points": "矢量至少需要两个点",
  "Vector": "矢量",
  "Convert this shape into an editable vector path.": "将此图形转换为可编辑的矢量路径。",
  "Convert to vector": "转换为矢量",
  "{count} points": "{count} 个锚点",
  "Closed path": "闭合路径",
  "Open path": "开放路径",
  "Close path": "闭合路径",
  "Make corner": "转为尖角",
  "Smooth point": "平滑锚点",
  "Delete point": "删除锚点",
  "Deselect point": "取消选择锚点",
  "Double-click the path to add a point. Drag anchors or handles; Alt-click deletes an anchor.":
    "双击路径添加锚点；拖拽锚点或控制柄；Alt + 点击删除锚点。",
  "Pathfinder": "路径查找器",
  "Union": "合并",
  "Subtract": "减去",
  "Intersect": "相交",
  "Exclude": "排除",
  "Uses the bottom layer as the base. Curves are preserved when possible.": "以底层图层为基座，尽可能保留曲线。",
  "Image trace": "图像描摹",
  "Trace to vector": "描摹为矢量",
  "Image traced to vector": "图像已描摹为矢量",
  "Could not trace this image": "无法描摹该图像",
  "Uses local color tracing. Works best on logos, icons and flat illustrations.": "使用本地颜色描摹，最适合 Logo、图标和扁平插画。",
  "Split paths": "拆分路径",
  "Simplify": "简化",
  "Offset +": "外扩",
  "Offset −": "内缩",
  "Outline stroke": "描边转轮廓",
  "Offset": "偏移",
  "Fill rule": "填充规则",
  "{count} subpaths": "{count} 个子路径",

  // Agent context & skills
  "Agent context & skills": "Agent 上下文与技能",
  "Give Sigma AI project-specific design rules, agent instructions and reusable skills.":
    "为 Sigma AI 提供项目设计规范、Agent 指令和可复用技能。",
  "Skills": "技能",
  "Upload SKILL.md": "上传 SKILL.md",
  "Agent Skills format with YAML frontmatter: name, description, then markdown instructions.":
    "Agent Skills 格式：YAML frontmatter 包含 name、description，后接 Markdown 指令。",
  "No custom skills yet.": "还没有自定义技能。",
  "SKILL.md must be under 512 KB": "SKILL.md 必须小于 512 KB",
  "Skill “{name}” uploaded": "技能“{name}”已上传",
  "Skill deleted": "技能已删除",
  "Design.md is loaded into every AI request as the project's design system.":
    "Design.md 会作为项目设计系统注入每次 AI 请求。",
  "AGENTS.md tells the agent how to work in this workspace: conventions, constraints and review rules.":
    "AGENTS.md 告诉 Agent 如何在此工作区工作：约定、约束和审查规则。",
  "Agent context saved": "Agent 上下文已保存",
  "Save context": "保存上下文",
  "Upload .md": "上传 .md",
  "# Design system\n- Brand color: #0ea5e9\n- Radius: 12px\n- Font: Inter\n- Spacing: 4 / 8 / 12 / 16 / 24":
    "# 设计系统\n- 品牌色：#0ea5e9\n- 圆角：12px\n- 字体：Inter\n- 间距：4 / 8 / 12 / 16 / 24",
  "# Agent instructions\n- Always create a frame before adding layers.\n- Use sentence case.\n- Keep contrast accessible.":
    "# Agent 指令\n- 添加图层前先创建画板。\n- 使用句首大写。\n- 保持可访问的对比度。",
  "Release binaries verify SHA-256 checksums before replacing the running server.":
    "发布版本会在替换当前服务前校验 SHA-256。",
  "Connected · {model} · {ms}ms": "连接成功 · {model} · {ms}ms",
  "Connection OK": "连接正常",
  "Key configured": "已配置 Key",
  "No API key configured": "尚未配置 API Key",
  "Clear key": "清除 Key",
  "Provider": "服务商",
  "Base URL": "接口地址",
  "Model": "模型",
  "latest": "最新",
  "API key": "API Key",
  "Leave blank to keep the current key": "留空以保留当前 Key",
  "The key is encrypted with AES-GCM and only used to call the model you configure.":
    "Key 使用 AES-GCM 加密，仅用于调用你配置的模型。",
  "Save & test": "保存并测试",
  "OpenAI-compatible": "OpenAI 兼容",

  "(you)": "（你）",
  "{count} selected": "已选 {count} 个",
  "Press F and drag to create a frame.": "按 F 并在画布上拖拽以创建画板。",
  "Hold Space to pan, ⌘/Ctrl + scroll to zoom.": "按住空格平移，⌘/Ctrl + 滚轮缩放。",
  "Select layers and press ⌘G to group.": "选中图层后按 ⌘G 编组。",
  "Add a link in the Prototype tab, then hit Play.": "在「原型」标签页添加跳转，然后点击演示。",
  "Tip: for a quick review, invite the demo account demo@sigma.design. Only people with access can open this file.":
    "提示：快速评审可邀请 demo@sigma.design。只有拥有访问权限的人才能打开此文件。",

  "Play prototype": "演示原型",
  "Could not find the layer on canvas": "无法在画布上找到该图层",
  "Double-click to replace": "双击替换图片",

  "Mobile app": "移动应用",
  "Landing page": "落地页",
  "Analytics dashboard": "数据看板",
  "A 3-step onboarding flow with prototype links and a design system page.": "包含三步引导流程、原型跳转与设计系统页面的移动应用模板。",
  "A polished SaaS marketing site with features and a linked pricing page.": "精致的 SaaS 营销官网，包含功能区块与可跳转的定价页。",
  "A data-rich desktop dashboard with KPIs, charts and a mobile companion.": "数据丰富的桌面看板，包含 KPI、图表与移动端视图。",
  "Start from scratch with an empty 1440 × 900 page.": "从空白的 1440 × 900 页面开始。",

  "Opening your canvas…": "正在打开画布…",
  "We couldn’t open this design": "无法打开此设计",
  "Good morning": "早上好",
  "Good afternoon": "下午好",
  "Good evening": "晚上好",
  "Let’s turn your next idea into an interactive prototype.": "把下一个想法变成可交互的原型。",
  "You have {count} designs in your workspace.": "你的工作区有 {count} 个设计。",
  "{count} designs · Press N for a new canvas": "{count} 个设计 · 按 N 新建画布",
  "Open menu": "打开菜单",
  "Close menu": "关闭菜单",
  "Create a new design": "创建新设计",
  "Pick a starting point or begin with a blank canvas.": "选择一个起点，或从空白画布开始。",
  "Untitled design": "未命名设计",
  "This permanently deletes the design, its pages, comments and version history. This action cannot be undone.":
    "这将永久删除设计、页面、评论与版本历史，且无法撤销。",
  "No designs match": "没有匹配的设计",
  "Try a different name or clear the search.": "换个名称试试，或清除搜索。",
  "Clear search": "清除搜索",
  "No starred designs yet": "还没有收藏的设计",
  "Nothing shared with you yet": "还没有共享给你的设计",
  "Your canvas is waiting": "画布正等着你",
  "Star the designs you want to keep close — they’ll show up here.":
    "收藏想随时打开的设计，它们会出现在这里。",
  "When a teammate invites you to a design, it will appear here.":
    "当团队成员邀请你加入设计时，它会出现在这里。",
  "Start from a template or a blank canvas and turn your idea into a clickable prototype.":
    "从模板或空白画布开始，把想法变成可点击的原型。",
  "Create your first design": "创建你的第一个设计",
  "View all designs": "查看全部设计",
  "Try again": "重试",
  "Remove star": "取消收藏",
  "Star": "收藏",
  "Search designs…": "搜索设计…",
  "Flow": "流程",
  "Interactions": "交互",
  "Clear": "清除",
  "No fill": "无填充",
  "Select layers with the same parent to group": "请选择同一父级下的图层进行编组",
};


const dictionary: Record<Locale, Record<string, string>> = {
  en: {},
  zh,
};

function detectLocale(): Locale {
  const stored = localStorage.getItem("sigma.locale");
  if (stored === "zh" || stored === "en") return stored;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function applyLocale(locale: Locale) {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
}

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  let value = dictionary[locale][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replaceAll(`{${k}}`, String(v));
    }
  }
  return value;
}

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggle: () => void;
}

export const useI18n = create<I18nState>((set, get) => ({
  locale: detectLocale(),
  setLocale: (locale) => {
    localStorage.setItem("sigma.locale", locale);
    applyLocale(locale);
    set({ locale });
  },
  toggle: () => get().setLocale(get().locale === "en" ? "zh" : "en"),
}));

export function bootI18n() {
  applyLocale(useI18n.getState().locale);
}

/** Hook returning a locale-aware translate function. */
export function useT() {
  const locale = useI18n((s) => s.locale);
  return (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
