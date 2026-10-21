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
  "Rename design": "重命名设计",
  "Create design": "创建设计",
  "Design name": "设计名称",
  "Blank canvas": "空白画布",
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
