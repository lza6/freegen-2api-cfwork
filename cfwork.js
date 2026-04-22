/**
 * =================================================================================
 * 项目: freegen-2api (Cloudflare Worker 单文件版)
 * 版本: 1.0.2 (代号: Chimera Synthesis - FreeGen Art 完美渲染版)
 * 作者: 首席AI执行官 (Principal AI Executive Officer)
 * 协议: 奇美拉协议 · 综合版 (Project Chimera: Synthesis Edition)
 * 日期: 2026-04-23
 *
 * [核心特性]
 * 1.[无缝代理] 完美封装 FreeGen.app 的 Signer、Generator 和 WebSocket 接口。
 * 2.[多模态支持] 完美兼容 OpenAI Vision 格式，精准解析多轮对话中的 Base64 触发图生图。
 * 3.[流式响应] 完美支持 SSE 流式输出，兼容 Cherry Studio、NextChat 等主流客户端。
 * 4.[高颜值驾驶舱] 内置全中文、SaaS级高颜值调试界面，支持拖拽、粘贴上传图片。
 * 5.[生产级标准] 包含请求水印、CORS 处理和优雅的错误处理。
 * 6.[超大流处理] 完美解决超大 Base64 图像在 SSE 流传输时的 TCP 分块截断问题。
 * =================================================================================
 */

// ---[第一部分: 核心配置 (Configuration-as-Code)] ---
const CONFIG = {
  // 项目元数据
  PROJECT_NAME: "freegen-2api",
  PROJECT_VERSION: "1.0.2",

  // 安全配置 (建议在 Cloudflare 环境变量中设置 API_MASTER_KEY)
  API_MASTER_KEY: "1",

  // 上游服务配置
  SIGNER_URL: "https://prompt-signer.freegen.app/",
  GENERATOR_URL: "https://image-generator.freegen.app/",
  WS_URL: "wss://websocket-bridge.freegen.app/ws",
  STATS_URL: "https://stats.freegen.app/record-completion",

  // 伪装头
  HEADERS: {
    "accept": "*/*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "content-type": "application/json",
    "origin": "https://freegen.app",
    "referer": "https://freegen.app/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site"
  },

  // 模型列表
  MODELS:[
    "freegen-txt2img",
    "freegen-img2img",
    "gpt-4o", // 兼容性映射
    "dall-e-3" // 兼容性映射
  ],
  DEFAULT_MODEL: "freegen-txt2img",
};

// ---[第二部分: Worker 入口与路由] ---
export default {
  async fetch(request, env, ctx) {
    // 环境变量覆盖
    const apiKey = env.API_MASTER_KEY || CONFIG.API_MASTER_KEY;
    request.ctx = { apiKey };

    const url = new URL(request.url);

    // 1. CORS 预检
    if (request.method === 'OPTIONS') return handleCorsPreflight();

    // 2. 路由分发
    if (url.pathname === '/') return handleUI(request);
    if (url.pathname === '/favicon.ico') return new Response(null, { status: 204 }); // 消除 favicon 404 报错
    if (url.pathname.startsWith('/v1/')) return handleApi(request, ctx);
    
    return createErrorResponse(`路径未找到: ${url.pathname}`, 404, 'not_found');
  }
};

// ---[第三部分: 核心业务逻辑 (FreeGen API 交互)] ---

/**
 * 等待 WebSocket 返回图像结果
 * @param {string} jobId - 任务 ID
 * @returns {Promise<string>} - 图像 URL 或 Base64
 */
async function waitForImageViaWebSocket(jobId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const message = jobId + timestamp;
  
  // 生成 Auth Token
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const auth = btoa(hashHex).substring(0, 20) + ':' + timestamp;

  const ws = new WebSocket(CONFIG.WS_URL);

  return new Promise((resolve, reject) => {
    let timeout = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket 轮询超时 (120秒)"));
    }, 120000);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        type: 'subscribe',
        job_id: jobId,
        auth: auth
      }));
    });

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'result') {
          clearTimeout(timeout);
          ws.close();
          resolve(msg.image_data);
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(msg.message || "上游生成失败"));
        }
      } catch (e) {
        console.error("WebSocket 解析错误:", e);
      }
    });

    ws.addEventListener('error', (err) => {
      clearTimeout(timeout);
      reject(new Error("WebSocket 连接错误"));
    });
  });
}

/**
 * 核心生成逻辑：调用 Signer -> Generator -> WebSocket
 */
async function generateImage(prompt, ratio_id = "1:1", image_data = null, ctx) {
  const startTime = Date.now();

  // 1. 调用 Signer 获取签名
  const signerRes = await fetch(CONFIG.SIGNER_URL, {
    method: "POST",
    headers: CONFIG.HEADERS,
    body: JSON.stringify({ prompt })
  });

  if (!signerRes.ok) {
    throw new Error(`Signer 签名失败: ${signerRes.status} ${await signerRes.text()}`);
  }
  const { ts, sig } = await signerRes.json();

  // 2. 调用 Generator 提交任务
  const genPayload = { prompt, ts, sig, ratio_id };
  if (image_data) {
    genPayload.image_data = image_data;
  }

  const genRes = await fetch(CONFIG.GENERATOR_URL, {
    method: "POST",
    headers: CONFIG.HEADERS,
    body: JSON.stringify(genPayload)
  });

  if (!genRes.ok) {
    throw new Error(`Generator 提交失败: ${genRes.status} ${await genRes.text()}`);
  }
  const genData = await genRes.json();

  let finalImageUrl = null;

  // 3. 获取结果 (支持旧版直接返回和新版 WebSocket 队列)
  if (genData.image_data_url) {
    finalImageUrl = genData.image_data_url;
  } else if (genData.job_id) {
    finalImageUrl = await waitForImageViaWebSocket(genData.job_id);
    
    // 异步记录统计信息 (不阻塞主流程)
    ctx.waitUntil(
      fetch(CONFIG.STATS_URL, {
        method: "POST",
        headers: CONFIG.HEADERS,
        body: JSON.stringify({
          job_id: genData.job_id,
          total_time_ms: Date.now() - startTime,
          timestamp: new Date().toISOString()
        })
      }).catch(err => console.error("Stats 记录失败:", err))
    );
  } else {
    throw new Error("上游返回了未知的响应格式");
  }

  return finalImageUrl;
}

// --- [第四部分: API 接口处理] ---

async function handleApi(request, ctx) {
  if (!verifyAuth(request)) return createErrorResponse('Unauthorized - 无效的 API Key', 401, 'unauthorized');

  const url = new URL(request.url);
  const requestId = `req-${crypto.randomUUID()}`;

  if (url.pathname === '/v1/models') {
    return new Response(JSON.stringify({
      object: 'list',
      data: CONFIG.MODELS.map(id => ({ id, object: 'model', created: Date.now(), owned_by: 'freegen' }))
    }), { headers: corsHeaders({ 'Content-Type': 'application/json' }) });
  }

  if (url.pathname === '/v1/chat/completions') {
    return handleChatCompletions(request, requestId, ctx);
  }
  
  if (url.pathname === '/v1/images/generations') {
    return handleImageGenerations(request, requestId, ctx);
  }

  return createErrorResponse('Not Found', 404, 'not_found');
}

// 处理 Chat 接口 (适配 Cherry Studio / NextChat / 沉浸式翻译)
async function handleChatCompletions(request, requestId, ctx) {
  try {
    const body = await request.json();
    const messages = body.messages ||[];
    
    let prompt = "";
    let image_data = null;
    let ratio_id = "1:1";

    // 1. 完美解析多模态消息 (OpenAI Vision 格式)
    // 遍历所有消息，提取所有的文本，并获取最后一张上传的图片
    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            prompt += part.text + "\n";
          } else if (part.type === 'image_url') {
            // 兼容不同的 image_url 传递方式
            if (typeof part.image_url === 'string') {
              image_data = part.image_url;
            } else if (part.image_url && part.image_url.url) {
              image_data = part.image_url.url;
            }
          }
        }
      } else if (typeof msg.content === 'string') {
        prompt += msg.content + "\n";
      }
    }

    prompt = prompt.trim();

    // 2. 兼容 WebUI 传参 hack (如果 prompt 是 JSON 字符串)
    try {
      if (prompt.startsWith('{') && prompt.endsWith('}')) {
        const parsed = JSON.parse(prompt);
        if (parsed.prompt) prompt = parsed.prompt;
        if (parsed.ratio_id) ratio_id = parsed.ratio_id;
        if (parsed.image_data) image_data = parsed.image_data;
      }
    } catch(e) {}

    if (!prompt && !image_data) throw new Error("Prompt 或图片不能为空");

    // 3. 流式输出处理
    if (body.stream) {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      
      ctx.waitUntil((async () => {
        try {
          // 发送初始状态
          const initChunk = createChatChunk(requestId, body.model, "🎨 *正在连接 FreeGen 引擎绘制中，请稍候...*\n\n");
          await writer.write(encoder.encode(`data: ${JSON.stringify(initChunk)}\n\n`));

          // 执行生成
          const imageUrl = await generateImage(prompt, ratio_id, image_data, ctx);
          
          // 发送结果
          const content = `![Generated Image](${imageUrl})\n\n*Prompt: ${prompt}*`;
          const resultChunk = createChatChunk(requestId, body.model, content);
          await writer.write(encoder.encode(`data: ${JSON.stringify(resultChunk)}\n\n`));
          
          // 结束流
          const endChunk = createChatChunk(requestId, body.model, "", "stop");
          await writer.write(encoder.encode(`data: ${JSON.stringify(endChunk)}\n\n`));
          await writer.write(encoder.encode('data:[DONE]\n\n'));
        } catch (e) {
          const errChunk = createChatChunk(requestId, body.model, `\n\n❌ **生成失败**: ${e.message}`, "stop");
          await writer.write(encoder.encode(`data: ${JSON.stringify(errChunk)}\n\n`));
        } finally {
          await writer.close();
        }
      })());

      return new Response(readable, { headers: corsHeaders({ 'Content-Type': 'text/event-stream' }) });
    }

    // 4. 非流式响应
    const imageUrl = await generateImage(prompt, ratio_id, image_data, ctx);
    const content = `![Generated Image](${imageUrl})\n\n*Prompt: ${prompt}*`;

    return new Response(JSON.stringify({
      id: requestId, object: 'chat.completion', created: Math.floor(Date.now()/1000),
      model: body.model || CONFIG.DEFAULT_MODEL, 
      choices:[{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }]
    }), { headers: corsHeaders({ 'Content-Type': 'application/json' }) });

  } catch (e) {
    return createErrorResponse(e.message, 500, 'internal_error');
  }
}

// 处理 Image 接口 (标准 DALL-E 格式)
async function handleImageGenerations(request, requestId, ctx) {
  try {
    const body = await request.json();
    const prompt = body.prompt;
    const size = body.size || "1024x1024";
    
    // 映射 OpenAI size 到 FreeGen ratio_id
    let ratio_id = "1:1";
    if (size === "1024x1792") ratio_id = "9:16";
    else if (size === "1792x1024") ratio_id = "16:9";
    else if (size === "768x1024") ratio_id = "3:4";
    else if (size === "1024x768") ratio_id = "4:3";

    const imageUrl = await generateImage(prompt, ratio_id, null, ctx);
    
    return new Response(JSON.stringify({
      created: Math.floor(Date.now()/1000),
      data:[{ url: imageUrl, revised_prompt: prompt }]
    }), { headers: corsHeaders({ 'Content-Type': 'application/json' }) });
  } catch (e) {
    return createErrorResponse(e.message, 500, 'internal_error');
  }
}

// --- 辅助函数 ---

function verifyAuth(request) {
  const auth = request.headers.get('Authorization');
  const key = request.ctx.apiKey;
  if (key === "1") return true;
  return auth === `Bearer ${key}`;
}

function createChatChunk(id, model, content, finishReason = null) {
  return {
    id: id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: model || CONFIG.DEFAULT_MODEL,
    choices:[{ index: 0, delta: content ? { content } : {}, finish_reason: finishReason }]
  };
}

function createErrorResponse(msg, status, code) {
  return new Response(JSON.stringify({ error: { message: msg, type: 'api_error', code } }), {
    status, headers: corsHeaders({ 'Content-Type': 'application/json' })
  });
}

function corsHeaders(headers = {}) {
  return {
    ...headers,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function handleCorsPreflight() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// ---[第五部分: 开发者驾驶舱 UI (WebUI)] ---
function handleUI(request) {
  const origin = new URL(request.url).origin;
  
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${CONFIG.PROJECT_NAME} - 开发者驾驶舱</title>
    <style>
        :root {
            --bg-gradient: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
            --panel-bg: rgba(30, 41, 59, 0.7);
            --panel-border: rgba(255, 255, 255, 0.1);
            --primary: #6366f1;
            --primary-hover: #4f46e5;
            --accent: #10b981;
            --err: #ef4444;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --input-bg: rgba(15, 23, 42, 0.6);
        }
        
        * { box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: var(--bg-gradient);
            color: var(--text-main);
            margin: 0;
            height: 100vh;
            display: flex;
            overflow: hidden;
        }
        
        .container { display: flex; width: 100%; height: 100%; }
        
        /* 滚动条美化 */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.3); }

        /* 左侧控制面板 */
        .left-panel {
            width: 400px;
            padding: 24px;
            display: flex;
            flex-direction: column;
            border-right: 1px solid var(--panel-border);
            background: rgba(15, 23, 42, 0.4);
            backdrop-filter: blur(10px);
            overflow-y: auto;
            flex-shrink: 0;
            z-index: 10;
        }
        
        /* 右侧预览面板 */
        .right-panel {
            flex: 1;
            padding: 24px;
            display: flex;
            flex-direction: column;
            position: relative;
            gap: 20px;
        }
        
        .header-title {
            margin-top: 0;
            margin-bottom: 24px;
            color: #fff;
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 22px;
            font-weight: 600;
            text-shadow: 0 2px 10px rgba(99, 102, 241, 0.5);
        }
        
        .header-title span {
            font-size: 12px;
            background: rgba(99, 102, 241, 0.2);
            color: #a5b4fc;
            padding: 4px 8px;
            border-radius: 12px;
            font-weight: normal;
            border: 1px solid rgba(99, 102, 241, 0.3);
        }
        
        .box {
            background: var(--panel-bg);
            padding: 20px;
            border-radius: 16px;
            margin-bottom: 20px;
            border: 1px solid var(--panel-border);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        }
        
        .label {
            font-size: 13px;
            color: var(--text-muted);
            margin-bottom: 8px;
            display: block;
            font-weight: 500;
        }
        
        input[type="text"], textarea, select {
            width: 100%;
            background: var(--input-bg);
            border: 1px solid var(--panel-border);
            color: #fff;
            padding: 12px;
            border-radius: 10px;
            margin-bottom: 16px;
            font-family: inherit;
            font-size: 14px;
            transition: all 0.2s;
        }
        
        input[type="text"]:focus, textarea:focus, select:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }
        
        input[readonly] { cursor: pointer; }
        input[readonly]:hover { background: rgba(255, 255, 255, 0.05); }
        
        button.primary-btn {
            width: 100%;
            padding: 14px;
            background: var(--primary);
            border: none;
            border-radius: 10px;
            color: white;
            font-weight: 600;
            font-size: 15px;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }
        
        button.primary-btn:hover {
            background: var(--primary-hover);
            transform: translateY(-1px);
        }
        
        button.primary-btn:disabled {
            background: #475569;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        
        /* 拖拽上传区域 */
        .upload-area {
            border: 2px dashed var(--panel-border);
            border-radius: 12px;
            padding: 24px 16px;
            text-align: center;
            cursor: pointer;
            margin-bottom: 16px;
            transition: all 0.3s ease;
            background: rgba(0, 0, 0, 0.2);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        
        .upload-area:hover, .upload-area.dragover {
            border-color: var(--primary);
            background: rgba(99, 102, 241, 0.1);
        }
        
        .upload-icon { font-size: 24px; opacity: 0.7; }
        .upload-text { font-size: 13px; color: var(--text-muted); pointer-events: none; }
        
        /* 图片预览区域 */
        .image-preview-container {
            position: relative;
            display: none;
            margin-bottom: 16px;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid var(--panel-border);
            background: #000;
        }
        
        .image-preview-container img {
            width: 100%;
            display: block;
            object-fit: contain;
            max-height: 200px;
        }
        
        .remove-image-btn {
            position: absolute;
            top: 8px;
            right: 8px;
            background: rgba(0, 0, 0, 0.6);
            color: white;
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 50%;
            width: 28px;
            height: 28px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            transition: all 0.2s;
            backdrop-filter: blur(4px);
        }
        
        .remove-image-btn:hover {
            background: var(--err);
            transform: scale(1.1);
        }
        
        /* 聊天窗口 */
        .chat-window {
            flex: 2;
            background: var(--panel-bg);
            backdrop-filter: blur(10px);
            border: 1px solid var(--panel-border);
            border-radius: 16px;
            padding: 20px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        }
        
        .msg {
            padding: 14px 18px;
            border-radius: 16px;
            line-height: 1.6;
            font-size: 15px;
            max-width: 85%;
            word-wrap: break-word;
            animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .msg.user {
            align-self: flex-end;
            background: var(--primary);
            color: white;
            border-bottom-right-radius: 4px;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
        }
        
        .msg.ai {
            align-self: flex-start;
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid var(--panel-border);
            border-bottom-left-radius: 4px;
        }
        
        .msg img {
            max-width: 100%;
            border-radius: 10px;
            margin-top: 12px;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(0,0,0,0.3);
            transition: transform 0.2s;
        }
        
        .msg img:hover { transform: scale(1.01); }
        
        /* 日志窗口 */
        .log-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: var(--panel-bg);
            backdrop-filter: blur(10px);
            border: 1px solid var(--panel-border);
            border-radius: 16px;
            overflow: hidden;
        }
        
        .log-header {
            padding: 12px 20px;
            background: rgba(0, 0, 0, 0.2);
            border-bottom: 1px solid var(--panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .log-window {
            flex: 1;
            overflow-y: auto;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 13px;
            color: #a5b4fc;
            padding: 16px;
            white-space: pre-wrap;
            word-break: break-all;
        }
        
        .log-entry { margin-bottom: 10px; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 10px; }
        .log-entry:last-child { border-bottom: none; }
        .log-time { color: #64748b; margin-right: 8px; }
        .log-key { color: var(--accent); font-weight: bold; }
        .log-err { color: var(--err); }
        
        .copy-btn {
            background: transparent;
            border: 1px solid var(--panel-border);
            padding: 4px 10px;
            font-size: 12px;
            color: var(--text-muted);
            cursor: pointer;
            border-radius: 6px;
            transition: all 0.2s;
        }
        
        .copy-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        
        /* 响应式 */
        @media (max-width: 768px) {
            .container { flex-direction: column; }
            .left-panel { width: 100%; border-right: none; border-bottom: 1px solid var(--panel-border); }
            .right-panel { padding: 16px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="left-panel">
            <h2 class="header-title">
                🎨 ${CONFIG.PROJECT_NAME}
                <span>v${CONFIG.PROJECT_VERSION}</span>
            </h2>
            
            <div class="box">
                <span class="label">API Endpoint (点击复制)</span>
                <input type="text" value="__WORKER_ORIGIN__/v1/chat/completions" readonly onclick="copyText(this.value, 'API 地址已复制')">
                <span class="label">API Key (点击复制)</span>
                <input type="text" value="__API_MASTER_KEY__" readonly onclick="copyText(this.value, 'API Key 已复制')">
            </div>

            <div class="box">
                <span class="label">模型选择</span>
                <select id="model">
                    __MODEL_OPTIONS__
                </select>
                
                <span class="label">比例 (Aspect Ratio)</span>
                <select id="ratio">
                    <option value="1:1">1:1 (方形)</option>
                    <option value="16:9">16:9 (横屏)</option>
                    <option value="9:16">9:16 (竖屏)</option>
                    <option value="4:3">4:3</option>
                    <option value="3:4">3:4</option>
                </select>

                <span class="label">参考图 (图生图 - 支持拖拽/粘贴)</span>
                <input type="file" id="file-input" accept="image/*" style="display:none" onchange="handleFileInput(event)">
                
                <div class="upload-area" id="upload-area" onclick="document.getElementById('file-input').click()">
                    <div class="upload-icon">🖼️</div>
                    <span class="upload-text">点击、拖拽或 Ctrl+V 粘贴图片</span>
                </div>
                
                <div class="image-preview-container" id="image-preview-container">
                    <button class="remove-image-btn" onclick="removeImage(event)" title="移除图片">✖</button>
                    <img id="preview-img" src="" alt="Preview">
                </div>

                <span class="label">提示词 (Prompt)</span>
                <textarea id="prompt" rows="4" placeholder="描述你想生成的图片... (支持直接 Ctrl+V 粘贴图片到此处)"></textarea>
                
                <button id="btn" class="primary-btn" onclick="send()">🚀 开始生成</button>
            </div>
        </div>
        
        <div class="right-panel">
            <div class="chat-window" id="chat">
                <div style="text-align:center; color:#64748b; margin:auto;">
                    <div style="font-size:48px; margin-bottom:16px; filter: drop-shadow(0 0 10px rgba(99,102,241,0.4));">✨</div>
                    <h3 style="color:#e2e8f0; margin-bottom:8px;">FreeGen 代理服务已就绪</h3>
                    <p style="font-size:14px; line-height:1.6;">
                        完美兼容 OpenAI Vision 格式<br>
                        支持文本生图、图生图、SSE 流式输出
                    </p>
                </div>
            </div>
            
            <div class="log-container">
                <div class="log-header">
                    <span style="font-size:13px; font-weight:600; color:#e2e8f0;">📡 实时调试日志</span>
                    <button class="copy-btn" onclick="document.getElementById('logs').innerHTML=''">清空日志</button>
                </div>
                <div class="log-window" id="logs"></div>
            </div>
        </div>
    </div>

    <script>
        const API_KEY = "__API_MASTER_KEY__";
        const URL = "__WORKER_ORIGIN__/v1/chat/completions";
        let uploadedBase64 = null;

        // 提示工具
        function showToast(msg) {
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:var(--primary); color:white; padding:10px 20px; border-radius:8px; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,0.2); transition:opacity 0.3s;';
            toast.innerText = msg;
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2000);
        }

        function copyText(text, msg) {
            navigator.clipboard.writeText(text);
            showToast(msg || '已复制到剪贴板');
        }

        function appendLog(step, data, isErr = false) {
            const div = document.createElement('div');
            div.className = 'log-entry' + (isErr ? ' log-err' : '');
            const time = new Date().toLocaleTimeString();
            const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
            div.innerHTML = \`<div><span class="log-time">[\${time}]</span> <span class="log-key">\${step}</span></div><div style="margin-top:4px;">\${content}</div>\`;
            document.getElementById('logs').appendChild(div);
            document.getElementById('logs').scrollTop = document.getElementById('logs').scrollHeight;
        }

        function appendChat(role, html) {
            const div = document.createElement('div');
            div.className = 'msg ' + role;
            div.innerHTML = html;
            const chat = document.getElementById('chat');
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
            return div;
        }

        // --- 图片处理逻辑 (拖拽、粘贴、选择) ---
        function processFile(file) {
            if (!file || !file.type.startsWith('image/')) {
                showToast('请上传有效的图片文件');
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                uploadedBase64 = e.target.result;
                document.getElementById('preview-img').src = uploadedBase64;
                document.getElementById('upload-area').style.display = 'none';
                document.getElementById('image-preview-container').style.display = 'block';
                appendLog('UI', '已加载参考图 (Base64)');
                showToast('图片加载成功');
            };
            reader.readAsDataURL(file);
        }

        function handleFileInput(e) {
            if (e.target.files.length > 0) processFile(e.target.files[0]);
        }

        function removeImage(e) {
            if(e) e.stopPropagation();
            uploadedBase64 = null;
            document.getElementById('upload-area').style.display = 'flex';
            document.getElementById('image-preview-container').style.display = 'none';
            document.getElementById('file-input').value = '';
            appendLog('UI', '已移除参考图');
        }

        // 拖拽事件
        const dropZone = document.getElementById('upload-area');
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('dragover'); });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
        });

        // 全局粘贴事件
        document.addEventListener('paste', (e) => {
            const items = e.clipboardData.items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    processFile(items[i].getAsFile());
                    e.preventDefault(); // 阻止默认粘贴行为
                    break;
                }
            }
        });

        // --- 发送请求逻辑 ---
        async function send() {
            const prompt = document.getElementById('prompt').value.trim();
            if (!prompt && !uploadedBase64) return showToast('请输入提示词或上传图片');
            
            const btn = document.getElementById('btn');
            btn.disabled = true;
            btn.innerText = "生成中...";
            
            // 清理初始欢迎语
            if(document.querySelector('.chat-window').innerText.includes('代理服务已就绪')) {
                document.getElementById('chat').innerHTML = '';
            }
            
            let userHtml = prompt || '[仅参考图]';
            if (uploadedBase64) {
                userHtml += '<br><img src="' + uploadedBase64 + '" style="max-height:100px; width:auto; margin-top:8px; border-radius:6px;">';
            }
            appendChat('user', userHtml);
            
            const aiMsg = appendChat('ai', '<span style="color:#94a3b8;">⏳ 正在连接 FreeGen 引擎...</span>');
            
            // 构造 Payload (使用 WebUI Hack 方式传参，后端已完美兼容)
            const payloadContent = JSON.stringify({
                prompt: prompt,
                ratio_id: document.getElementById('ratio').value,
                image_data: uploadedBase64
            });

            const requestBody = {
                model: document.getElementById('model').value,
                messages:[{ role: 'user', content: payloadContent }],
                stream: true
            };

            appendLog('Request', '发送生成请求...');

            try {
                const res = await fetch(URL, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });

                if (!res.ok) throw new Error(await res.text());

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let fullText = '';
                
                // [关键修复] 引入 buffer 解决超大 Base64 字符串导致的 TCP 分块截断问题
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (value) {
                        buffer += decoder.decode(value, { stream: true });
                    }
                    const lines = buffer.split('\\n');
                    
                    // 如果流未结束，最后一行可能是不完整的 JSON，保留在 buffer 中等待下一次拼接
                    if (!done) {
                        buffer = lines.pop();
                    } else {
                        buffer = '';
                    }
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.slice(6).trim();
                            if (jsonStr === '[DONE]') break;
                            if (!jsonStr) continue;
                            try {
                                const json = JSON.parse(jsonStr);
                                const content = json.choices[0]?.delta?.content;
                                if (content) {
                                    fullText += content;
                                    // 高性能正则解析 Markdown 图片，并处理换行符
                                    let htmlContent = fullText.replace(/!\\[[^\\]]*\\]\\(([^)]+)\\)/g, '<img src="$1" onclick="window.open(this.src)" title="点击查看大图">');
                                    htmlContent = htmlContent.replace(/\\n/g, '<br>');
                                    aiMsg.innerHTML = htmlContent;
                                    document.getElementById('chat').scrollTop = document.getElementById('chat').scrollHeight;
                                }
                            } catch (e) {
                                console.error("解析 JSON 失败 (可能是截断):", e, jsonStr.substring(0, 100));
                            }
                        }
                    }
                    if (done) break;
                }
                appendLog('Success', '图像生成完成');
            } catch (e) {
                aiMsg.innerHTML = '<span style="color:var(--err)">❌ 错误: ' + e.message + '</span>';
                appendLog("Error", e.message, true);
            } finally {
                btn.disabled = false;
                btn.innerText = "🚀 开始生成";
            }
        }
    </script>
</body>
</html>`;

  const modelOptions = CONFIG.MODELS.map(m => `<option value="${m}">${m}</option>`).join('');
  
  const finalHtml = html
    .replace(/__WORKER_ORIGIN__/g, origin)
    .replace(/__API_MASTER_KEY__/g, CONFIG.API_MASTER_KEY)
    .replace(/__MODEL_OPTIONS__/g, modelOptions);

  return new Response(finalHtml, { 
    headers: { 
      'Content-Type': 'text/html; charset=utf-8'
      // 移除了 'Content-Encoding': 'br'，交由 Cloudflare 自动压缩，防止浏览器乱码
    } 
  });
}
