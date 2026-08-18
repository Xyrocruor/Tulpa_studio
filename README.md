# 筑灵 · Tulpa Studio

一站式 tulpa 创造工具：为新手提供完整教程、性格与角色设计、每日练习打卡、日志记录与里程碑追踪。

> ⚠️ 理性看待：tulpa 实践建立在自身心智之上，本工具内容仅供学习参考。若你正经历严重心理困扰，请优先寻求专业心理帮助。

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 🏠 仪表盘 | 相伴天数、练习统计、连续打卡、今日练习清单、每日一句、数据备份 |
| 🎨 设计工作室 | 基础信息 / 性格特质库（60+ 特质 + 自定义）/ 形象（参考图上传+链接、可视化练习）/ 声音 / 关系 / 背景故事，自动保存 |
| 🖼️ 形象参考 | 多张参考图（本地压缩存储/图片链接）、设主图、仪表盘每日形象卡、存储用量监控 |
| 🧘 可视化练习 | 引导式训练：凝视 12 秒 → 闭眼回想 25 秒 → 记录，练出"脑内看见 ta"的能力 |
| 📖 教程中心 | 8 章分步教程、32 个中英对照术语、13 条 FAQ、12 个常见误区 |
| 📓 记录日志 | 主动强制计时器、练习/日记/感应三类记录、时间线与筛选 |
| 🏆 里程碑 | 10 项社区通行成长节点（含 Tulpish），状态追踪 + 笔记 |
| 🔗 资源库 | 12 个实测验证的社区/资料链接、使用须知 |

## 技术说明

- 纯前端静态站点：`index.html` + `css/style.css` + `js/data.js` + `js/app.js`，无任何依赖、无需构建、离线可用。
- 数据全部保存在浏览器 **localStorage**（键 `tulpaStudio.v1`），不会上传任何服务器。建议定期在「仪表盘 → 数据管理」导出备份。
- 支持数据导出 / 导入 / 清空。

## 本地运行

直接用浏览器打开 `index.html` 即可（推荐通过任意静态服务器访问，如 `python -m http.server` 或 `npx serve`）。

## 单文件打包（便于部署与分享）

```bash
node build-single.mjs   # 生成 dist/tulpa-studio.html（所有资源内联为单文件，约 123KB）
```

单文件版可以：直接双击打开、发给任何人、上传到任意静态托管 / 网盘 / QQ 文件。

## 目录结构

```
tulpa/
├── index.html                    # 应用外壳
├── css/style.css                 # 设计系统（星尘 · 深空极光主题）
├── js/data.js                    # 内置知识库（特质/里程碑/教程/术语/FAQ/误区/资源）
├── js/app.js                     # 状态管理、路由与各模块逻辑
├── build-single.mjs              # 打包脚本：生成自包含单文件
├── dist/tulpa-studio.html        # 单文件版（可直接分享/任意托管）
├── tulpa-cn-research-report.md   # 中文社区调研报告（资源/术语/方法论/伦理）
├── tulpa-culture-research-report.md  # 国际社区调研报告（EN）
└── .test-harness/                # jsdom 端到端冒烟测试（45 项断言）
```

## 测试

```bash
cd .test-harness && npm install jsdom   # 首次
node .test-harness\test.js              # 运行 45 项端到端测试（多文件版）
$env:TULPA_HTML = "dist\tulpa-studio.html"; node .test-harness\test.js   # 单文件版
```

## 内容来源

教程与术语综合自社区通行方法论与两份调研报告，具体资源链接见应用内「资源库」：
- 中文：Tulpa 之家（tulpa.cn）、PluralityCN《中文Tulpa社区准则》、多意识体百科（wiki.pluralitycn.com）、MPSTEAM 百科
- 国际：tulpa.info、r/Tulpas FAQ、tulpa.io、《Tulpamancy Guide I Wish I Had》、Tulpanomicon、tulpa.guide
