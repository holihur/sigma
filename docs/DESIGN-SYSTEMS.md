# 设计系统模板

Sigma 内置 11 套模板：10 套设计语言 + 空白画布。每套设计系统包含 Home / Foundations / Components 三页，Components 页中的控件是主组件，可直接插入实例。

## Material Design 3

模板 id：`material`

| Token | 值 |
| --- | --- |
| Primary | `#6750A4` |
| Primary container | `#EADDFF` |
| Secondary | `#625B71` |
| Tertiary | `#7D5260` |
| Surface | `#FFFBFE` |
| Error | `#B3261E` |
| Radius | 8 / 12 / 16 / 28 / full |
| Type | Roboto：Display / Headline / Title / Body / Label |

包含：Top app bar、搜索、Quick actions 卡片、FAB、Navigation bar、Foundations 色板 / 字阶 / 按钮 / 卡片。

Design.md 建议：

```md
# Material 3
- Primary #6750A4, on-primary #FFFFFF
- Primary container #EADDFF, on-container #21005D
- Surface #FFFBFE, surface-variant #F3EDF7
- Outline #79747E
- Radius: small 8, medium 12, large 16, extra-large 28, full 999
- Use Roboto; title 22, body 14, label 13
- FAB uses primary container, 16px radius
```

## Apple Human Interface Guidelines

模板 id：`ios`

| Token | 值 |
| --- | --- |
| System Blue | `#007AFF` |
| Green | `#34C759` |
| Red | `#FF3B30` |
| Orange | `#FF9500` |
| Grouped Background | `#F2F2F7` |
| Label / Secondary | `#000000` / `#8E8E93` |
| Radius | 12 / 14 / full |
| Type | SF Pro：Large Title 34, Body 17, Footnote 13, Caption 12 |

包含：分组设置、头像行、开关、chevron 列表、Tab Bar、Foundation 色板。

Design.md 建议：

```md
# Apple HIG
- Use SF Pro / system font.
- Background #F2F2F7, cards #FFFFFF.
- Blue #007AFF for actions; red #FF3B30 destructive.
- Large title 34 bold, body 17, footnote 13.
- Grouped cards radius 14, separators #E5E5EA.
- Minimum touch target 44px.
```

## Microsoft Fluent 2

模板 id：`fluent`

| Token | 值 |
| --- | --- |
| Brand | `#0F6CBD` |
| Brand hover | `#115EA3` |
| Neutral bg | `#F5F5F5` |
| Surface | `#FFFFFF` |
| Stroke | `#D1D1D1` |
| Text | `#242424` / `#616161` |
| Radius | 4 / 8 |
| Type | Segoe UI：Title 28, Subtitle 20, Body 14, Caption 12 |

包含：Command bar、Sidebar、Metric cards、数据表、Primary button、Foundations。

Design.md 建议：

```md
# Fluent 2
- Brand #0F6CBD, hover #115EA3.
- Neutral background #F5F5F5, surface #FFFFFF.
- Stroke #D1D1D1, text #242424 / #616161.
- Radius 4 for controls, 8 for cards.
- Use Segoe UI; body 14, caption 12.
- 1px borders and subtle elevation.
```

## IBM Carbon

模板 id：`carbon`

| Token | 值 |
| --- | --- |
| Blue 60 | `#0F62FE` |
| Gray 10 | `#F4F4F4` |
| Gray 90 | `#262626` |
| Gray 100 | `#161616` |
| Red 60 | `#DA1E28` |
| Green 50 | `#24A148` |
| Yellow 30 | `#F1C21B` |
| Type | IBM Plex Sans：Heading 28, Body 14, Label 12 |

包含：UI Shell header、Side nav、KPI tiles、数据表、状态徽标、Foundations。

Design.md 建议：

```md
# IBM Carbon
- Blue 60 #0F62FE primary, Gray 100 #161616 shell.
- Background Gray 10 #F4F4F4, surface #FFFFFF.
- Borders #E0E0E0; text #161616 / #525252.
- Radius 0 for productive components.
- Use IBM Plex Sans; heading 28, body 14, label 12.
- Status: green #24A148, red #DA1E28, yellow #F1C21B.
```

## 通用模板

| id | 说明 |
| --- | --- |
| `blank` | 1440×900 空白画布 |

> 移动应用、落地页、数据看板三套通用模板已移除，只保留有明确设计语言归属的模板。

## Ant Design

模板 id：`ant`

| Token | 值 |
| --- | --- |
| Primary | `#1677FF` |
| Success | `#52C41A` |
| Warning | `#FAAD14` |
| Error | `#FF4D4F` |
| Border | `#D9D9D9` |
| Container | `#FFFFFF` |
| Radius | 6（控件）/ 8（卡片） |
| Type | PingFang SC：28 / 16 / 14 / 12 |

包含 Dashboard、Foundations、Components。

## ByteDance Arco

模板 id：`arco`

| Token | 值 |
| --- | --- |
| Primary | `#165DFF` |
| Success | `#00B42A` |
| Warning | `#FF7D00` |
| Danger | `#F53F3F` |
| Border | `#E5E6EB` |
| Surface | `#FFFFFF` |
| Radius | 4 |
| Type | PingFang SC：28 / 16 / 13 / 12 |

包含 Console、Foundations、Components。

## Element Plus

模板 id：`element`

| Token | 值 |
| --- | --- |
| Primary | `#409EFF` |
| Success | `#67C23A` |
| Warning | `#E6A23C` |
| Danger | `#F56C6C` |
| Border | `#DCDFE6` |
| Surface | `#FFFFFF` |
| Radius | 4 |
| Type | Helvetica Neue：28 / 16 / 13 / 12 |

包含 Dashboard、Foundations、Components。

## Firefox Photon

模板 id：`firefox`

| Token | 值 |
| --- | --- |
| Primary | `#0060DF` |
| Accent | `#FF7139` |
| Ink | `#20123A` |
| Success | `#058B00` |
| Border | `#E0E0E6` |
| Radius | 8 |
| Type | Inter：28 / 18 / 13 / 10 |

包含 New tab、Foundations、Components。隐私面板、快捷入口、最近标签页和 Pocket 推荐都采用 Mozilla Photon 的浅色表面与蓝色主色。

## WeChat

模板 id：`wechat`

| Token | 值 |
| --- | --- |
| WeChat Green | `#07C160` |
| Link Blue | `#576B95` |
| Alert Red | `#FA5151` |
| Ink | `#191919` |
| Muted | `#888888` |
| Radius | 6 |
| Type | PingFang SC：20 / 15 / 12 / 10 |

包含 Chats、Foundations、Components。聊天列表使用 72px 行高、红点未读、浅灰底与微信绿选中态。

## shadcn/ui

模板 id：`shadcn`

| Token | 值 |
| --- | --- |
| Primary | `#18181B` |
| Muted | `#71717A` |
| Border | `#E4E4E7` |
| Surface | `#FFFFFF` |
| Accent | `#F4F4F5` |
| Danger | `#EF4444` |
| Radius | 10 |
| Type | Inter：30 / 14 / 12 / 10 |

包含 Overview、Foundations、Components。中性 zinc 色、1px 边框、无渐变表面和紧凑数据表。

## 生成模板

模板由脚本生成并嵌入 Go 二进制：

```bash
cd frontend
pnpm gen:templates
cd ../backend
go build -o ../sigma-server .
```

脚本位置：`frontend/scripts/gen-templates.ts`，输出到 `backend/internal/templates/*.json`。
