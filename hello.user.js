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
        propertyName: '番号',          // 对应 Notion 中的属性名（用于 title 查询）
        playLinkProperty: 'PlayLink'   // 对应 Notion 中的 PlayLink 字段（用于 pick_code 查询）
    };

    // PlayLink URL 格式配置（用于构建完整 URL 进行精确匹配）
    const PLAYLINK_URL_FORMATS = [
        'https://115vod.com/?pickcode={pickcode}'  // 标准格式（优先尝试）
        // 'http://115vod.com/?pickcode={pickcode}',   // http 版本
        // 'https://115vod.com?pickcode={pickcode}',   // 没有斜杠
        // 'http://115vod.com?pickcode={pickcode}'     // http + 没有斜杠
    ];

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

    // 3.1 通过 pick_code 查询 Notion（精确匹配方案）
    // 尝试多种 URL 格式，直到找到匹配为止
    async function queryNotionByPickCode(pickCode) {
        console.log(`[PickCode查询] 开始查询: ${pickCode}`);
        
        // 依次尝试每种 URL 格式
        for (let i = 0; i < PLAYLINK_URL_FORMATS.length; i++) {
            const urlTemplate = PLAYLINK_URL_FORMATS[i];
            const fullUrl = urlTemplate.replace('{pickcode}', pickCode);
            
            console.log(`[PickCode查询] 尝试格式 ${i + 1}/${PLAYLINK_URL_FORMATS.length}: ${fullUrl}`);
            
            // 使用精确匹配查询
            const result = await new Promise((resolve) => {
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
                            property: NOTION_CONFIG.playLinkProperty,
                            url: { equals: fullUrl }  // 精确匹配完整 URL
                        }
                    }),
                    onload: (res) => {
                        if (res.status === 200) {
                            const data = JSON.parse(res.responseText);
                            
                            if (data.results && data.results.length > 0) {
                                console.log(`✅ [PickCode查询] 找到匹配！格式: ${urlTemplate}`);
                                resolve(data.results[0].url);  // 返回 Notion Page URL
                            } else {
                                console.log(`❌ [PickCode查询] 未匹配此格式`);
                                resolve(null);
                            }
                        } else {
                            console.error(`[PickCode查询] API错误: ${res.status}`);
                            resolve(null);
                        }
                    },
                    onerror: (err) => {
                        console.error('[PickCode查询] 请求失败:', err);
                        resolve(null);
                    }
                });
            });
            
            // 如果找到了，立即返回，不再尝试其他格式
            if (result) {
                return result;
            }
            
            // 在尝试下一个格式之前，稍微延迟避免 API 限流
            if (i < PLAYLINK_URL_FORMATS.length - 1) {
                await sleep(100);
            }
        }
        
        console.log(`❌ [PickCode查询] 所有格式均未匹配: ${pickCode}`);
        return null;
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

    // 4.1 基于 pick_code 的匹配处理（新增）
    async function startMatchingByPickCode() {
        const items = document.querySelectorAll('.list-thumb ul li[rel="item"]');
        
        console.log(`[PickCode模式] 开始处理 ${items.length} 个文件...`);

        let processedCount = 0;
        let skippedCount = 0;
        let noPickCodeCount = 0;

        for (let li of items) {
            // 避免重复注入（使用不同的 class 名区分）
            if (li.querySelector('.notion-pickcode-icon')) continue;

            const pickCode = li.getAttribute('pick_code');
            
            // 检查是否有 pick_code 属性
            if (!pickCode || pickCode.trim() === '') {
                console.log(`[跳过] 该元素没有 pick_code 属性`);
                noPickCodeCount++;
                continue;
            }
            
            processedCount++;
            
            // 创建状态图标（使用不同的 class 和位置）
            const statusIcon = document.createElement('span');
            statusIcon.className = 'notion-pickcode-icon';  // 不同的 class
            statusIcon.innerHTML = ' 🎬'; // 查询中的占位符
            statusIcon.style.cssText = "position:absolute; top:5px; right:5px; z-index:10; font-size:14px; cursor:pointer;";  // 位置在右上角
            li.appendChild(statusIcon);

            // 请求间隔
            await sleep(350);
            
            // 执行查询
            const pageUrl = await queryNotionByPickCode(pickCode);

            if (pageUrl) {
                // 匹配成功
                statusIcon.innerHTML = ' 🎬';
                statusIcon.title = `点击打开 Notion (PickCode: ${pickCode})`;
                statusIcon.onclick = (e) => {
                    e.stopPropagation();
                    window.open(pageUrl, '_blank');
                };
                statusIcon.style.color = "#e64980";  // 使用不同颜色区分
                statusIcon.style.background = "rgba(255,255,255,0.8)";
                statusIcon.style.padding = "2px 4px";
                statusIcon.style.borderRadius = "3px";
            } else {
                // 匹配失败
                statusIcon.innerHTML = ' ❌';
                statusIcon.title = `PickCode 未匹配: ${pickCode}`;
                statusIcon.style.opacity = "0.3";
            }
        }
        
        console.log(`[PickCode模式] 处理完成: 已查询 ${processedCount} 个文件, 跳过 ${noPickCodeCount} 个无pick_code的文件`);
    }

    // 5. 注入主控制按钮（原有功能）
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

    // 5.1 注入 PickCode 匹配按钮（新增功能）
    function injectPickCodeButton() {
        const btn = document.createElement('button');
        btn.innerText = ' 🎬 匹配 PlayLink ';
        btn.style.cssText = `
            position: fixed; bottom: 75px; right: 20px; z-index: 10000;
            padding: 10px 20px; background: #e64980; color: white;
            border: none; border-radius: 50px; cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-weight: bold;
        `;
        btn.onclick = startMatchingByPickCode;
        document.body.appendChild(btn);
    }

    // 初始化按钮（同时注入两个按钮）
    setTimeout(() => {
        injectControlPanel();        // 原有按钮：基于 title 匹配
        injectPickCodeButton();      // 新增按钮：基于 pick_code 匹配
    }, 2000);

})();