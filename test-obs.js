const express = require('express');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

console.log(chalk.cyan('=== OBS服务诊断工具 ===\n'));

// ==================== 1. 检查依赖 ====================
console.log(chalk.yellow('1. 检查依赖模块...'));

const requiredModules = {
    'express': 'Web服务器',
    'axios': 'HTTP请求',
    'winston': '日志系统',
    'chalk': '彩色输出'
};

let allModulesOk = true;

for (const [module, description] of Object.entries(requiredModules)) {
    try {
        require(module);
        console.log(chalk.green(`  ✅ ${module} - ${description}`));
    } catch (e) {
        console.log(chalk.red(`  ❌ ${module} - ${description}`));
        console.log(chalk.gray(`     请运行: npm install ${module}`));
        allModulesOk = false;
    }
}

if (!allModulesOk) {
    console.log(chalk.red('\n❌ 缺少依赖，请先安装'));
    process.exit(1);
}

// ==================== 2. 检查目录结构 ====================
console.log(chalk.yellow('\n2. 检查目录结构...'));

const requiredDirs = [
    'obs-display',
    'obs-display/assets',
    'config',
    'logs',
    'data'
];

requiredDirs.forEach(dir => {
    const fullPath = path.join(__dirname, dir);
    if (fs.existsSync(fullPath)) {
        console.log(chalk.green(`  ✅ ${dir}/`));
    } else {
        console.log(chalk.yellow(`  ⚠️ ${dir}/ 不存在，创建中...`));
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(chalk.green(`     ✅ 已创建`));
    }
});

// ==================== 3. 检查文件完整性 ====================
console.log(chalk.yellow('\n3. 检查OBS文件...'));

const requiredFiles = [
    { path: 'obs-display/server.js', critical: true },
    { path: 'obs-display/index.html', critical: true },
    { path: 'obs-display/assets/style.css', critical: true },
    { path: 'obs-display/assets/script.js', critical: true }
];

let allFilesOk = true;

requiredFiles.forEach(file => {
    const fullPath = path.join(__dirname, file.path);
    if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        console.log(chalk.green(`  ✅ ${file.path} (${(stats.size/1024).toFixed(1)}KB)`));
    } else {
        console.log(chalk.red(`  ❌ ${file.path} - 文件缺失`));
        if (file.critical) allFilesOk = false;
    }
});

if (!allFilesOk) {
    console.log(chalk.red('\n❌ 关键文件缺失，OBS功能无法使用'));
    process.exit(1);
}

// ==================== 4. 端口检查 ====================
console.log(chalk.yellow('\n4. 检查端口可用性...'));

async function checkPort(port) {
    return new Promise((resolve) => {
        const server = express().listen(port);
        
        server.on('listening', () => {
            server.close();
            resolve(true);
        });
        
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(false);
            } else {
                resolve(false);
            }
        });
    });
}

async function findAvailablePort() {
    const preferredPorts = [8888, 8889, 8890, 8080, 3000];
    
    for (const port of preferredPorts) {
        const available = await checkPort(port);
        if (available) {
            console.log(chalk.green(`  ✅ 端口 ${port} 可用`));
            return port;
        } else {
            console.log(chalk.yellow(`  ⚠️ 端口 ${port} 已被占用`));
        }
    }
    
    // 查找随机端口
    for (let port = 9000; port < 9100; port++) {
        const available = await checkPort(port);
        if (available) {
            console.log(chalk.green(`  ✅ 找到可用端口 ${port}`));
            return port;
        }
    }
    
    return null;
}

// ==================== 5. 启动测试服务器 ====================
console.log(chalk.yellow('\n5. 启动OBS测试服务...'));

async function startTestServer() {
    const port = await findAvailablePort();
    
    if (!port) {
        console.log(chalk.red('❌ 没有可用端口'));
        return;
    }
    
    try {
        // 加载OBS服务器
        const OBSDisplayServer = require('./obs-display/server');
        const obsServer = new OBSDisplayServer(port);
        
        const started = await obsServer.start();
        
        if (started) {
            console.log(chalk.green('\n✅ OBS服务启动成功！\n'));
            
            console.log(chalk.cyan('访问地址:'));
            console.log(`  本地访问: ${chalk.underline(`http://localhost:${port}`)}`);
            console.log(`  网络访问: ${chalk.underline(`http://[你的IP]:${port}`)}`);
            console.log(`  测试接口: ${chalk.underline(`http://localhost:${port}/test`)}`);
            
            console.log(chalk.cyan('\n测试功能:'));
            console.log('  1. 正在执行自动测试...\n');
            
            // 执行自动测试
            setTimeout(() => runAutoTest(obsServer), 1000);
            
            console.log(chalk.gray('\n提示: 按 Ctrl+C 退出测试\n'));
            
        } else {
            console.log(chalk.red('❌ OBS服务启动失败'));
        }
        
    } catch (error) {
        console.log(chalk.red('❌ 启动测试服务器失败:'), error.message);
        if (error.stack) {
            console.log(chalk.gray(error.stack));
        }
    }
}

// ==================== 6. 自动测试序列 ====================
async function runAutoTest(obsServer) {
    const tests = [
        {
            name: '播放器显示',
            delay: 0,
            action: () => {
                obsServer.updateNowPlaying({
                    song: '测试歌曲名称',
                    singer: '测试歌手',
                    album: '测试专辑',
                    requester: 'OBS测试',
                    duration: 240,
                    pic: null
                });
            }
        },
        {
            name: '新歌弹窗',
            delay: 2000,
            action: () => {
                obsServer.showNewRequest({
                    user: '测试用户',
                    song: '青花瓷',
                    type: 'normal'
                });
            }
        },
        {
            name: '队列更新',
            delay: 4000,
            action: () => {
                obsServer.updateQueue([
                    { name: '晴天', singer: '周杰伦', requestBy: { username: '用户A' } },
                    { name: '七里香', singer: '周杰伦', requestBy: { username: '用户B' } },
                    { name: '稻香', singer: '周杰伦', requestBy: { username: '用户C' } }
                ]);
            }
        },
        {
            name: '歌词显示',
            delay: 6000,
            action: () => {
                obsServer.updateLyrics({
                    current: '天青色等烟雨',
                    next: '而我在等你',
                    translation: 'The sky blue waits for rain'
                });
            }
        },
        {
            name: '进度更新',
            delay: 8000,
            action: () => {
                let progress = 0;
                const interval = setInterval(() => {
                    progress += 5;
                    obsServer.updateProgress(progress, 240);
                    
                    if (progress >= 240) {
                        clearInterval(interval);
                    }
                }, 200);
            }
        },
        {
            name: '礼物动画',
            delay: 10000,
            action: () => {
                obsServer.showGiftAnimation({
                    user: '土豪用户',
                    giftName: '小电视飞船',
                    num: 1,
                    price: 1245000
                });
            }
        },
        {
            name: '通知消息',
            delay: 12000,
            action: () => {
                obsServer.showNotification({
                    type: 'success',
                    message: '✅ OBS测试完成！',
                    duration: 5000
                });
            }
        }
    ];
    
    // 执行测试序列
    for (const test of tests) {
        setTimeout(() => {
            console.log(chalk.blue(`  ▶ ${test.name}`));
            test.action();
        }, test.delay);
    }
    
    // 测试完成提示
    setTimeout(() => {
        console.log(chalk.green('\n✅ 所有测试完成！'));
        console.log(chalk.gray('提示: 测试服务器仍在运行，按 Ctrl+C 退出'));
    }, 14000);
}

// ==================== 7. 系统信息 ====================
console.log(chalk.yellow('\n6. 系统信息...'));
console.log(`  操作系统: ${process.platform}`);
console.log(`  Node版本: ${process.version}`);
console.log(`  当前目录: ${__dirname}`);

// ==================== 启动测试 ====================
startTestServer().catch(err => {
    console.error(chalk.red('测试失败:'), err);
    process.exit(1);
});

// 优雅退出
process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\n正在关闭测试服务器...'));
    process.exit(0);
});