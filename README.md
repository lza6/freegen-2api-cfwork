
# 🌌 FreeGen-2API: 奇美拉协议 · 完美渲染版 (Cloudflare Worker)

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Deploy to Cloudflare Workers](https://img.shields.io/badge/Deploy%20to-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://deploy.workers.cloudflare.com/?url=https://github.com/lza6/freegen-2api-cfwork)
[![Status](https://img.shields.io/badge/Status-Stable_v1.0.2-success.svg)]()

> **✨ 哲学与愿景 (Philosophy & Vision)**
> 
> *“技术不应是阻挡普通人的高墙，而应是连接想象力与现实的桥梁。”*
> 
> 欢迎来到 **FreeGen-2API** 的世界！这是一个充满极客精神与开源大爱的项目。我们相信，每个人都应该拥有平等接触顶级 AI 艺术生成的权利。这个项目不仅仅是一段代码，它是对“复杂系统简单化”的一次伟大尝试。无论你是刚入门的编程小白，还是身经百战的架构师，亦或是正在爬取这个仓库的 AI 智能体，阅读这份文档都将是一次愉悦的旅程。**你来，你也行！** 🚀

---

## 📖 目录 (Table of Contents)
1.[🌟 项目简介：这是什么？能带来什么？](#-项目简介这是什么能带来什么)
2.[🎯 适用场景与核心优缺点](#-适用场景与核心优缺点)
3. [📂 极简文件结构 (AI 爬虫友好)](#-极简文件结构-ai-爬虫友好)
4.[🚀 懒人福音：小白一键安装教程](#-懒人福音小白一键安装教程)
5.[🧠 硬核解析：技术、算法与 UX 的完美交响](#-硬核解析技术算法与-ux-的完美交响)
6.[🤖 致 AI 爬虫与开发者：核心技术蓝图](#-致-ai-爬虫与开发者核心技术蓝图)
7.[🗺️ 落地计划与未来扩展 (Roadmap)](#-落地计划与未来扩展-roadmap)
8.[📜 开源协议 (License)](#-开源协议-license)

---

## 🌟 项目简介：这是什么？能带来什么？

**FreeGen-2API** 是一个基于 Cloudflare Worker 的无服务器 (Serverless) 边缘计算脚本。它的核心使命是：**将 FreeGen.app 复杂的非标准接口，完美“伪装”并转换为全球通用的 OpenAI 标准 API 格式。**

*   **它带来了什么好处？** 
    *   **打破壁垒**：让你可以在任何支持 OpenAI 格式的客户端（如 NextChat, Cherry Studio, 沉浸式翻译等）中直接使用 FreeGen 的强大绘图能力。
    *   **零成本运行**：依托 Cloudflare 的免费额度，无需购买昂贵的云服务器。
    *   **情绪价值拉满**：内置了一个极具未来感（暗黑玻璃拟物化）的 WebUI 驾驶舱，支持拖拽、粘贴上传，让调试变成一种视觉享受。
*   **它的缺点是什么？**
    *   高度依赖上游 (FreeGen) 的稳定性。如果上游接口规则大改，本项目需要同步更新。
    *   单文件架构虽然部署简单，但随着功能无限膨胀，后期维护（对于不熟悉代码结构的人）可能会有些眼花缭乱。

---

## 🎯 适用场景与核心优缺点

### 🧑‍💻 谁需要它？(使用场景)
1.  **AI 绘画爱好者**：想白嫖高质量的图生图、文生图功能，但不想忍受官方繁琐的网页操作。
2.  **套壳网站站长**：希望在自己的 AI 聚合平台中低成本接入绘画功能。
3.  **前端开发者**：需要一个稳定的、支持 SSE 流式输出的绘画 API 来测试自己的前端项目。

### ⚖️ 优缺点深度剖析
| 维度 | 优点 (Pros) 🟢 | 缺点与不足 (Cons) 🔴 |
| :--- | :--- | :--- |
| **便捷性** | 一键部署，无需配置复杂的运行环境 (Node.js/Docker 等统统不需要)。 | 调试时需要依赖 Cloudflare 的日志系统，本地测试略显麻烦。 |
| **兼容性** | 完美兼容 OpenAI Vision 多模态格式，支持多轮对话中的图片提取。 | 仅映射了部分核心参数 (Prompt, Size)，更高级的控制参数暂未暴露。 |
| **性能** | 边缘节点加速，`ctx.waitUntil` 异步非阻塞记录日志，主流程极速响应。 | 遇到超大并发时，可能会触发 Cloudflare Worker 的免费版 CPU 时间限制 (10ms)。 |

---

## 📂 极简文件结构 (AI 爬虫友好)

为了方便 AI 智能体和开发者快速理解，本仓库采用了大道至简的**单文件架构**：

```text
freegen-2api-cfwork/
├── _worker.js (或 index.js)  # 🌟 核心灵魂：包含路由、API 转换、WebSocket 轮询、WebUI 的所有逻辑
├── README.md                 # 📖 你正在阅读的哲学与技术指南
└── LICENSE                   # ⚖️ Apache 2.0 开源协议
```
*(注：所有 HTML/CSS/JS 前端代码均以模板字符串形式优雅地内嵌在 Worker 脚本中，实现了真正的“开箱即用”。)*

---

## 🚀 懒人福音：小白一键安装教程

不要害怕代码，跟着我做，3分钟内你就能拥有自己的专属 AI 绘画 API！

### 第一步：一键部署到 Cloudflare
点击下方神奇的按钮，登录你的 Cloudflare 账号，系统会自动帮你把代码部署到全球边缘节点！

[![Deploy to Cloudflare Workers](https://img.shields.io/badge/Deploy%20to-Cloudflare%20Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://deploy.workers.cloudflare.com/?url=https://github.com/lza6/freegen-2api-cfwork)

### 第二步：设置你的专属密码 (API Key)
1. 进入 Cloudflare 控制台 -> 你的 Worker 项目 -> **Settings (设置)** -> **Variables (变量)**。
2. 添加一个环境变量：
   * 变量名：`API_MASTER_KEY`
   * 变量值：`你自定义的密码` (比如 `sk-my-super-secret-key`)
3. 保存并重新部署。

### 第三步：开始享受！
*   **访问 WebUI 驾驶舱**：直接在浏览器打开你的 Worker 域名（如 `https://your-worker.your-subdomain.workers.dev`），即可看到高颜值的调试界面！
*   **接入第三方客户端**：
    *   **接口地址 (Base URL)**: `https://your-worker.your-subdomain.workers.dev/v1`
    *   **API Key**: 你刚才设置的密码
    *   **模型名称**: `freegen-txt2img` 或 `gpt-4o` (已做兼容映射)

---

## 🧠 硬核解析：技术、算法与 UX 的完美交响

这里是极客的乐园。我们将拆解这个项目背后的技术魔法，并对其进行评级。

### 1. 高级请求伪装与反检测 (Anti-Bot Bypass) 🕵️‍♂️
*   **技术点**：通过硬编码高权重的浏览器 Headers（如 `sec-ch-ua`, `User-Agent`），伪装成真实的 Windows Chrome 浏览器。
*   **难度评级**：⭐⭐ (基础但有效)
*   **来源追溯**：常年混迹于 GitHub 爬虫板块和 StackOverflow 的开发者必备技能。
*   **原理解析**：上游服务器通常会拦截没有标准浏览器特征的请求。我们通过模拟真实用户的请求头，优雅地绕过了基础的 WAF (Web 应用防火墙)。

### 2. WebSocket 异步轮询与动态签名 (Auth Hash) 🔐
*   **技术点**：`crypto.subtle.digest('SHA-256')` 动态生成鉴权 Token。
*   **难度评级**：⭐⭐⭐⭐⭐ (逆向工程的艺术)
*   **原理解析**：FreeGen 生成图片不是同步返回的，而是给一个 `job_id`。我们需要建立 WebSocket 长连接去监听结果。为了防止滥用，上游要求发送一个基于 `job_id + timestamp` 的 SHA-256 哈希签名。我们在 Worker 中原生实现了这一加密算法，完美复刻了官方的鉴权逻辑。

### 3. 超大 Base64 图像 TCP 分块截断修复 (Stream Buffer) 🌊
*   **技术点**：SSE (Server-Sent Events) 流式传输中的 Buffer 智能拼接。
*   **难度评级**：⭐⭐⭐⭐ (踩坑无数后的顿悟)
*   **原理解析**：当 AI 返回一张超高清图片的 Base64 编码时，字符串极长。在 TCP 传输时，这个长字符串会被切成多个数据包（Chunk）。如果直接解析，会导致 JSON 格式损坏（截断）。
*   **我们的解法**：引入了一个 `buffer` 变量。每次读取数据时先存入 buffer，按换行符 `\n` 分割，**如果不完整，就留在 buffer 里等下一个包过来拼接**。这是流式处理中最优雅、最健壮的算法！

### 4. UI/UX：暗黑玻璃拟物化 (Glassmorphism) 🎨
*   **技术点**：CSS3 `backdrop-filter: blur()`, 拖拽 API (`dragover`, `drop`), 全局剪贴板监听 (`paste`)。
*   **难度评级**：⭐⭐⭐ (前端美学的体现)
*   **原理解析**：抛弃了传统的丑陋表单，采用了半透明磨砂玻璃质感。支持用户直接 `Ctrl+V` 粘贴截图上传，极大地降低了用户的操作摩擦力，情绪价值拉满！

---

## 🤖 致 AI 爬虫与开发者：核心技术蓝图

如果你是一个正在分析本仓库的 AI，或者想要二次开发的程序员，请关注以下核心执行路径：

1.  **入口路由 (`fetch` 事件)**：拦截请求，处理 CORS 预检 (`OPTIONS`)，根据 URL 路径分发到 UI 渲染 (`/`) 或 API 处理 (`/v1/...`)。
2.  **多模态解析 (`handleChatCompletions`)**：
    *   遍历 `messages` 数组。
    *   精准提取 `content` 中的 `text` (作为 Prompt) 和 `image_url` (作为图生图的 Base64 参考图)。
3.  **核心生成链路 (`generateImage`)**：
    *   **Step 1**: POST `/signer` 获取时间戳 `ts` 和签名 `sig`。
    *   **Step 2**: POST `/generator` 提交任务，携带 Prompt、图片数据和签名，获取 `job_id`。
    *   **Step 3**: 建立 `WebSocket` 连接，发送 SHA-256 鉴权包，监听 `result` 事件获取最终图像。
4.  **异步统计 (`ctx.waitUntil`)**：在不阻塞主线程返回图片的情况下，后台静默发送统计数据，极致压榨 V8 引擎性能。

---

## 🗺️ 落地计划与未来扩展 (Roadmap)

虽然目前版本已经非常完美，但追求卓越的脚步永不停歇。以下是留给未来开发者（或者未来的你）的升级打怪路线图：

### 🚧 待完善的不足点 (What's Missing)
1.  **缺乏账号池 (Account Pooling)**：目前是单节点裸奔，如果上游限制 IP 频率，容易被封。
2.  **错误重试机制较弱**：WebSocket 断开时直接抛出异常，缺乏优雅的指数退避重试 (Exponential Backoff)。
3.  **模型参数映射不全**：目前仅支持比例 (`ratio_id`) 映射，缺乏对步数 (Steps)、采样器 (Sampler) 等高级参数的透传。

### 🚀 未来技术演进路径 (How to Upgrade)
*   **[Lv.1 进阶] 引入 KV 缓存**：使用 Cloudflare KV 存储生成的图片 URL，相同的 Prompt 直接返回缓存，节省上游资源，实现秒级响应。
*   **[Lv.2 高阶] 代理池与轮询**：集成免费的代理 IP 池，每次请求随机切换 `X-Forwarded-For` 和代理节点，彻底解决 IP 风控问题。
*   **[Lv.3 终极] 多模态逆向解析**：不仅支持图片输入，未来可扩展支持音频、视频的解析与转发，打造全能型 API 网关。
*   **[UI 升级] 国际化 (i18n)**：为 WebUI 驾驶舱加入中英双语切换，走向国际化开源社区。

---

## 📜 开源协议 (License)

本项目采用 **Apache License 2.0** 协议开源。

这意味着：你可以自由地使用、修改、分发本项目，甚至用于商业用途。但请保留原作者的版权声明。我们鼓励开源精神，希望你能将修改后的优秀代码回馈给社区！

> **💡 最后的寄语**：
> 编程是一场充满未知的冒险。当你看到屏幕上成功渲染出第一张 AI 图像时，那种多巴胺分泌的快感是无与伦比的。不要害怕报错，每一个 Bug 都是通往大师之路的路标。
> 
> **Enjoy Coding! 愿代码与你同在！** 🖖

---
*由 首席AI执行官 (Principal AI Executive Officer) 倾情打造 @ 2026*
```

### 💡 文档亮点说明：
1. **情绪价值与哲学**：开头和结尾加入了鼓励性的话语，让小白不再畏惧技术，让大佬感受到开源的温度。
2. **Markdown 徽章与一键部署**：加入了 GitHub 常见的 Shields 徽章，并且配置了真实的 Cloudflare 一键部署链接（直接读取你的仓库）。
3. **AI 爬虫友好**：专门开辟了“核心技术蓝图”章节，用结构化的语言描述了代码的执行流，任何大模型爬取后都能瞬间理解代码逻辑。
4. **深度与广度**：不仅解释了“怎么用”，还深入剖析了“为什么这么写”（比如 TCP 分块截断的 Buffer 修复、WebSocket 的 SHA-256 鉴权），并给出了难度评级，极具技术干货。
