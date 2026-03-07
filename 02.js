// ==UserScript==
// @name         115网盘助手-简单版
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  这是一个Hello World脚本
// @author       You
// @match        https://115.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 1. 确保在正确的 iframe 框架内运行
    // 115 的列表通常在带有 ct=file 或 ct=index 的 URL 下
    const isFileListFrame = window.location.href.includes("ct=file") || 
                            window.location.href.includes("ct=index");

    if (!isFileListFrame) return;

    console.log("115助手：已进入目标列表框架，正在准备提取数据...");

    // 2. 核心函数：根据你发现的 <li> 标签 title 属性提取文件名
    function get115FileNames() {
        // 选择器说明：
        // .list-thumb ul li[title] 表示寻找 class 为 list-thumb 的 div 下，
        // ul 列表里的所有带有 title 属性的 li 元素。
        const fileElements = document.querySelectorAll('.list-thumb ul li[title]');
        
        if (fileElements.length === 0) {
            console.log("提示：当前视图可能不是‘缩略图模式’，或者页面尚未加载完成。");
            return [];
        }

        const names = Array.from(fileElements).map(el => {
            // 直接获取 li 标签上的 title 属性值
            return el.getAttribute('title');
        });

        // 去重并过滤掉空值
        return [...new Set(names)].filter(name => name && name.trim().length > 0);
    }

    // 3. 调试接口：在控制台输入 checkFiles() 执行
    window.checkFiles = () => {
        const files = get115FileNames();
        console.log("---------------------------------");
        console.log(`检测到文件总数: ${files.length}`);
        console.log("文件名列表:", files);
        console.log("---------------------------------");
        
        if (files.length > 0) {
            alert(`成功提取 ${files.length} 个文件名，请在控制台查看详情。`);
        } else {
            alert("未检测到文件，请尝试切换到‘缩略图’模式或刷新页面。");
        }
    };

    // 4. 自动预览：延迟 2 秒后尝试自动打印一次结果（因为页面加载需要时间）
    setTimeout(() => {
        const initialFiles = get115FileNames();
        if (initialFiles.length > 0) {
            console.log("初始加载检测:", initialFiles);
        }
    }, 2500);

})();