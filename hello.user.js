// ==UserScript==
// @name         115网盘属性提取器
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  提取文件名、提取码和SHA1并下载为CSV
// @author       YourName
// @match        https://115.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 1. 框架检查：只在包含文件列表的 iframe 中运行
    const isFileListFrame = window.location.href.includes("ct=file") || window.location.href.includes("ct=index");
    if (!isFileListFrame) return;

    // 2. 核心数据提取函数
    function extract115Data() {
        // 根据你提供的结构定位所有 li 元素
        const items = document.querySelectorAll('.list-thumb ul li[rel="item"]');
        const results = [];

        items.forEach(li => {
            const title = li.getAttribute('title') || '未知文件名';
            const pickCode = li.getAttribute('pick_code') || '无';
            const sha1 = li.getAttribute('sha1') || '无';
            
            results.push({ title, pickCode, sha1 });
        });

        return results;
    }

    // 3. 将数据转换为 CSV 并下载
    function downloadAsCSV(data) {
        if (data.length === 0) {
            alert("没有发现可提取的文件记录！");
            return;
        }

        // 构建 CSV 内容 (添加 UTF-8 BOM 以防 Excel 打开乱码)
        let csvContent = "\uFEFF"; 
        csvContent += "文件名,提取码(PickCode),SHA1哈希值\n";

        data.forEach(item => {
            // 处理文件名中可能存在的逗号，防止破坏 CSV 结构
            const safeTitle = `"${item.title.replace(/"/g, '""')}"`;
            csvContent += `${safeTitle},${item.pickCode},${item.sha1}\n`;
        });

        // 创建下载链接
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        
        link.setAttribute("href", url);
        link.setAttribute("download", `115_Export_${new Date().getTime()}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // 4. 在界面注入按钮
    function injectUI() {
        // 创建一个简单的悬浮按钮
        const btn = document.createElement('button');
        btn.innerText = ' 一键提取三属性 (CSV) ';
        btn.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 9999;
            padding: 8px 15px;
            background-color: #2463f6;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            font-size: 14px;
        `;

        btn.onclick = () => {
            const data = extract115Data();
            console.log("提取到的原始数据:", data);
            downloadAsCSV(data);
        };

        document.body.appendChild(btn);
    }

    // 5. 延迟初始化，确保 115 的 DOM 加载完成
    setTimeout(injectUI, 3000);

})();