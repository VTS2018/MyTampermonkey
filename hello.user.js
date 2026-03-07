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

    // 4. 界面注入与处理
    async function startMatching() {
        // 定位到你分析出的 HTML 结构
        const items = document.querySelectorAll('.list-thumb ul li[rel="item"]');
        
        console.log(`开始处理 ${items.length} 个文件...`);

        for (let li of items) {
            // 避免重复注入
            if (li.querySelector('.notion-status-icon')) continue;

            const rawName = li.getAttribute('title');
            const cleanedName = cleanFileName(rawName);
            
            // 在 li 内部创建一个状态占位符（小图标）
            const statusIcon = document.createElement('span');
            statusIcon.className = 'notion-status-icon';
            statusIcon.innerHTML = ' 🔍'; // 查询中的占位符
            statusIcon.style.cssText = "position:absolute; top:5px; left:5px; z-index:10; font-size:12px; cursor:pointer;";
            li.appendChild(statusIcon);

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