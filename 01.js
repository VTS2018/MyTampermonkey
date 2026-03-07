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
    // 1. 判断是否进入了文件列表所在的那个特定 iframe
    // 115 的列表页 URL 规律通常包含 ?ct=file 或 ?ct=index
    const isFileListFrame = window.location.href.includes("ct=file") || 
                            window.location.href.includes("ct=index");

    if (!isFileListFrame) {
        // 如果不是目标框架，就静默退出，不打印任何东西
        return; 
    }
    console.log("成功进入文件列表框架:", window.location.href);

    // 当你打开 115 网盘时，网页会弹出这个提示
    console.log("Hello World: 脚本已加载！");
    // alert("Hello World! 115 脚本运行成功。");
})();