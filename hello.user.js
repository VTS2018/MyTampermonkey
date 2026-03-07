// ==UserScript==
// @name         115网盘 x Notion 智能助手
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  自动清洗文件名、查询Notion数据库并注入快捷链接
// @author       YourName
// @match        https://115.com/*
// @grant        GM_xmlhttpRequest
// @connect      api.notion.com
// ==/UserScript==

(function() {
    'use strict';

    // ================= 配置区 =================
    const NOTION_CONFIG = {
        token: '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',
        databaseId: '546b58ef109d4b4393824c33993374a8',
        propertyName: '番号' // 对应 Notion 中的属性名
    };

    // 排除的文件后缀列表（黑名单）
    const EXCLUDED_EXTENSIONS = [
        '.srt', '.ass', '.ssa',                      // 字幕文件
        '.jpg', '.jpeg', '.png', '.gif', '.bmp',     // 图片文件
        '.rar', '.zip', '.7z', '.tar', '.gz',        // 压缩包
        '.txt', '.nfo', '.md',                       // 文本文件
        '.exe', '.dll', '.so'                        // 可执行文件
    ];

    // 文件名清洗配置
    const FILE_CLEAN_CONFIG = {
        // 需要移除的末尾标记字符串（按顺序匹配，先长后短）
        suffixesToRemove: [
            '-UNCENSORED',
            '-CH', '_CH', 'CH',  // 中文字幕
            '-UC', '_UC',   // 未删减版本
            '-GG5', '_GG5',   // 其他标记
            '-4K', '_4K',   // 分辨率标记
            '-C', '_C',     // 单字母标记
            '-A', '_A'
        ]
    };

    // ================= 逻辑区 =================

    // 1. 框架检查
    const isFileListFrame = window.location.href.includes("ct=file") || window.location.href.includes("ct=index");
    if (!isFileListFrame) return;

    // 2. 字符串清洗逻辑 (例如: "DASS-128-C.mp4" -> "DASS-128")
    function cleanFileName(rawName) {
        if (!rawName) return "";
        return rawName
            .replace(/\.[^/.]+$/, "")           // 1. 去掉后缀 (.mp4, .mkv 等)
            .replace(/-[a-zA-Z]$/i, "")         // 2. 去掉末尾的 "-C" 或 "-A" (不区分大小写)
            .trim();                            // 3. 去掉首尾空格
    }

    // 2.1 增强版字符串清洗逻辑 (支持更多标记类型，循环移除)
    // 例如: "DASS-128-CH-UC.mp4" -> "DASS-128"
    function cleanFileNameEnhanced(rawName) {
        if (!rawName) return "";
        
        let cleaned = rawName;
        
        // 步骤1：移除任何文件后缀（.mp4, .mkv, .avi 等）
        cleaned = cleaned.replace(/\.[^/.]+$/, '');
        
        // 步骤2：循环移除末尾的标记字符串（支持多个连续标记）
        let hasMatch = true;
        let maxIterations = 5; // 防止意外的无限循环
        
        while (hasMatch && maxIterations-- > 0) {
            hasMatch = false;
            
            // 按配置顺序检查每个标记
            for (let suffix of FILE_CLEAN_CONFIG.suffixesToRemove) {
                // 不区分大小写比较
                if (cleaned.toUpperCase().endsWith(suffix.toUpperCase())) {
                    // 移除匹配的后缀
                    cleaned = cleaned.substring(0, cleaned.length - suffix.length);
                    hasMatch = true; // 标记找到匹配，继续下一轮检查
                    break; // 跳出内层循环，重新从头开始匹配
                }
            }
        }
        
        // 步骤3：去掉首尾空格
        return cleaned.trim();
    }

    // 3. 调用 Notion API 查询 (封装为 Promise，方便异步处理)
    function queryNotion(targetId) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: `https://api.notion.com/v1/databases/${NOTION_CONFIG.databaseId}/query`,
                headers: {
                    "Authorization": `Bearer ${NOTION_CONFIG.token}`,
                    "Content-Type": "application/json",
                    "Notion-Version": "2022-06-28"
                },
                data: JSON.stringify({
                    filter: {
                        property: NOTION_CONFIG.propertyName,
                        title: { equals: targetId } // 假设 "番号" 是 Title 类型
                    }
                }),
                onload: (res) => {
                    if (res.status === 200) {
                        const data = JSON.parse(res.responseText);
                        // 如果有匹配结果，返回第一个 Page 的 URL
                        if (data.results && data.results.length > 0) {
                            // 优先取 public_url，没有则取普通 url
                            resolve(data.results[0].url);
                        }
                    }
                    resolve(null);
                },
                onerror: () => resolve(null)
            });
        });
    }

    // 1. 定义一个等待函数 (类似于 .NET 的 Task.Delay)
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 4. 界面注入与处理
    async function startMatching() {
        // 定位到你分析出的 HTML 结构
        const items = document.querySelectorAll('.list-thumb ul li[rel="item"]');
        
        console.log(`开始处理 ${items.length} 个文件...`);

        let processedCount = 0;
        let skippedCount = 0;

        for (let li of items) {
            // 避免重复注入
            if (li.querySelector('.notion-status-icon')) continue;

            const rawName = li.getAttribute('title');
            
            // 文件后缀过滤：检查是否在排除列表中
            if (rawName) {
                const lastDotIndex = rawName.lastIndexOf('.');
                if (lastDotIndex !== -1) {
                    const fileExt = rawName.substring(lastDotIndex).toLowerCase();
                    if (EXCLUDED_EXTENSIONS.includes(fileExt)) {
                        console.log(`[跳过] ${rawName} (类型: ${fileExt})`);
                        skippedCount++;
                        continue; // 跳过此文件，不执行后续查询
                    }
                }
            }
            
            const cleanedName = cleanFileNameEnhanced(rawName);
            processedCount++;
            
            // 在 li 内部创建一个状态占位符（小图标）
            const statusIcon = document.createElement('span');
            statusIcon.className = 'notion-status-icon';
            statusIcon.innerHTML = ' 🔍'; // 查询中的占位符
            statusIcon.style.cssText = "position:absolute; top:5px; left:5px; z-index:10; font-size:12px; cursor:pointer;";
            li.appendChild(statusIcon);

            // --- 核心改进：在每次请求前设置间隔 ---
            // 设置 350ms 的间隔，确保每秒请求数不超过 3 次，安全稳定
            await sleep(350);

            // 执行异步查询
            const pageUrl = await queryNotion(cleanedName);

            if (pageUrl) {
                // 匹配成功：变更为超链接
                statusIcon.innerHTML = ' 📖'; // 成功的图标
                statusIcon.title = `点击打开 Notion: ${cleanedName}`;
                statusIcon.onclick = (e) => {
                    e.stopPropagation(); // 防止触发 115 自带的点击事件
                    window.open(pageUrl, '_blank');
                };
                statusIcon.style.color = "#6041e2";
                statusIcon.style.background = "rgba(255,255,255,0.8)";
            } else {
                // 匹配失败：显示灰色或隐藏
                statusIcon.innerHTML = ' ➕';
                statusIcon.title = "Notion 中未发现对应页面";
                statusIcon.style.opacity = "0.3";
            }
        }
        
        console.log(`处理完成: 已查询 ${processedCount} 个文件，跳过 ${skippedCount} 个文件`);
    }

    // 5. 注入主控制按钮
    function injectControlPanel() {
        const btn = document.createElement('button');
        btn.innerText = ' 🔗 匹配 Notion 状态 ';
        btn.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; z-index: 10000;
            padding: 10px 20px; background: #6041e2; color: white;
            border: none; border-radius: 50px; cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-weight: bold;
        `;
        btn.onclick = startMatching;
        document.body.appendChild(btn);
    }

    // 初始化按钮
    setTimeout(injectControlPanel, 2000);

})();