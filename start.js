const readline = require('readline');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// 创建交互界面
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// 清屏
console.clear();

// 显示Logo
function showLogo() {
    console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║        ____    ____  _   _  ____  _  ____    ____   ___  _____  ║
║       |  _ \\  |  _ \\| | | |/ ___|| |/ ___|  | __ ) / _ \\|_   _| ║
║       | |_) | | | | | | | |\\___ \\| | |      |  _ \\| | | | | |   ║
║       |  _ <  | |_| | |_| | ___) | | |___   | |_) | |_| | | |   ║
║       |_| \\_\\ |____/ \\___/ |____/|_|\\____|  |____/ \\___/  |_|   ║
║                                                                  ║
║                   B站直播间 × LX Music 点歌系统                   ║
║                          v2.0.0 重构版                           ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`));
}

// 检查必要文件
function checkFiles() {
    const requiredFiles = [
        'bot.js',
        'check-before-start.js',
        'setup.js',
        'test-obs.js'
    ];
    
    let allExist = true;
    for (const file of requiredFiles) {
        if (!fs.existsSync(path.join(__dirname, file))) {
            console.log(chalk.red(`❌ 缺少文件: ${file}`));
            allExist = false;
        }
    }
    
    return allExist;
}

// 显示状态信息
function showStatus() {
    console.log(chalk.gray('━'.repeat(70)));
    
    // 检查配置
    const configPath = path.join(__dirname, 'config', 'config.json');
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log(chalk.green('✅ 配置状态: 已配置'));
            console.log(chalk.gray(`   房间号: ${config.room?.roomId || '未设置'}`));
            console.log(chalk.gray(`   主播UID: ${config.room?.ownerUid || '未设置'}`));
        } catch (e) {
            console.log(chalk.red('❌ 配置状态: 配置文件损坏'));
        }
    } else {
        console.log(chalk.yellow('⚠️  配置状态: 未配置'));
    }
    
    // 检查依赖
    const nodeModulesPath = path.join(__dirname, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
        console.log(chalk.green('✅ 依赖状态: 已安装'));
    } else {
        console.log(chalk.red('❌ 依赖状态: 未安装'));
    }
    
    // 检查Cookie
    const cookiePath = path.join(__dirname, 'config', 'cookies.json');
    if (fs.existsSync(cookiePath)) {
        console.log(chalk.green('✅ Cookie状态: 已配置'));
    } else {
        console.log(chalk.yellow('⚠️  Cookie状态: 未配置（兼容模式）'));
    }
    
    console.log(chalk.gray('━'.repeat(70)));
}

// 显示菜单
function showMenu() {
    console.log(chalk.cyan('\n请选择要执行的操作:\n'));
    
    const menuItems = [
        { key: '1', label: '启动主程序', desc: '运行点歌机器人', color: 'green' },
        { key: '2', label: '启动前检查', desc: '检查环境和依赖', color: 'yellow' },
        { key: '3', label: '配置向导', desc: '创建或修改配置', color: 'blue' },
        { key: '4', label: 'OBS测试', desc: '测试OBS显示功能', color: 'magenta' },
        { key: '5', label: '查看日志', desc: '查看最新日志文件', color: 'cyan' },
        { key: '6', label: '清理数据', desc: '清理缓存和日志', color: 'gray' },
        { key: '0', label: '退出', desc: '关闭启动器', color: 'red' }
    ];
    
    menuItems.forEach(item => {
        const colorFn = chalk[item.color] || chalk.white;
        console.log(`  ${colorFn(item.key + '.')} ${item.label.padEnd(12)} - ${chalk.gray(item.desc)}`);
    });
    
    console.log();
}

// 执行命令
function runCommand(script, args = []) {
    return new Promise((resolve) => {
        console.log(chalk.cyan('\n执行中...\n'));
        
        const isWindows = process.platform === 'win32';
        const command = isWindows ? 'node.exe' : 'node';
        
        const child = spawn(command, [script, ...args], {
            stdio: 'inherit',
            shell: isWindows,
            cwd: __dirname
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                console.log(chalk.green('\n✅ 执行完成'));
            } else {
                console.log(chalk.red(`\n❌ 执行失败 (退出码: ${code})`));
            }
            
            setTimeout(() => {
                console.log(chalk.gray('\n按回车键返回主菜单...'));
                rl.once('line', () => {
                    mainMenu();
                });
            }, 1000);
        });
        
        child.on('error', (err) => {
            console.error(chalk.red('执行错误:'), err.message);
            setTimeout(() => {
                console.log(chalk.gray('\n按回车键返回主菜单...'));
                rl.once('line', () => {
                    mainMenu();
                });
            }, 1000);
        });
    });
}

// 查看日志
function viewLogs() {
    const logsDir = path.join(__dirname, 'logs');
    
    if (!fs.existsSync(logsDir)) {
        console.log(chalk.yellow('日志目录不存在'));
        setTimeout(() => mainMenu(), 2000);
        return;
    }
    
    const files = fs.readdirSync(logsDir)
        .filter(f => f.endsWith('.log'))
        .sort((a, b) => {
            const statA = fs.statSync(path.join(logsDir, a));
            const statB = fs.statSync(path.join(logsDir, b));
            return statB.mtime - statA.mtime;
        });
    
    if (files.length === 0) {
        console.log(chalk.yellow('没有日志文件'));
        setTimeout(() => mainMenu(), 2000);
        return;
    }
    
    console.log(chalk.cyan('\n最近的日志文件:\n'));
    
    files.slice(0, 10).forEach((file, index) => {
        const stat = fs.statSync(path.join(logsDir, file));
        const size = (stat.size / 1024).toFixed(1);
        const time = stat.mtime.toLocaleString('zh-CN');
        console.log(`  ${index + 1}. ${file} (${size}KB) - ${time}`);
    });
    
    console.log(chalk.gray(`\n日志目录: ${logsDir}`));
    console.log(chalk.gray('提示: 可以使用文本编辑器打开查看'));
    
    setTimeout(() => {
        console.log(chalk.gray('\n按回车键返回主菜单...'));
        rl.once('line', () => {
            mainMenu();
        });
    }, 1000);
}

// 清理数据
function cleanData() {
    console.log(chalk.yellow('\n清理选项:\n'));
    console.log('  1. 清理日志文件（保留最近7天）');
    console.log('  2. 清理数据缓存');
    console.log('  3. 清理所有数据（慎用）');
    console.log('  0. 返回主菜单');
    
    rl.question('\n请选择 (0-3): ', (answer) => {
        switch (answer.trim()) {
            case '1':
                cleanLogs();
                break;
            case '2':
                cleanCache();
                break;
            case '3':
                cleanAll();
                break;
            default:
                mainMenu();
                return;
        }
    });
}

function cleanLogs() {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
        console.log(chalk.yellow('日志目录不存在'));
        setTimeout(() => mainMenu(), 2000);
        return;
    }
    
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7天
    let cleaned = 0;
    
    fs.readdirSync(logsDir).forEach(file => {
        const filePath = path.join(logsDir, file);
        const stat = fs.statSync(filePath);
        
        if (now - stat.mtime.getTime() > maxAge) {
            fs.unlinkSync(filePath);
            cleaned++;
        }
    });
    
    console.log(chalk.green(`✅ 已清理 ${cleaned} 个旧日志文件`));
    setTimeout(() => mainMenu(), 2000);
}

function cleanCache() {
    const dataDir = path.join(__dirname, 'data');
    
    if (fs.existsSync(dataDir)) {
        // 只清理state.json（临时状态）
        const statePath = path.join(dataDir, 'state.json');
        if (fs.existsSync(statePath)) {
            fs.unlinkSync(statePath);
            console.log(chalk.green('✅ 已清理缓存数据'));
        } else {
            console.log(chalk.yellow('没有缓存数据'));
        }
    }
    
    setTimeout(() => mainMenu(), 2000);
}

function cleanAll() {
    console.log(chalk.red('\n⚠️  警告: 这将删除所有日志和数据！'));
    console.log(chalk.red('用户数据、播放历史等将被清空！'));
    
    rl.question('\n确定要继续吗？输入 YES 确认: ', (answer) => {
        if (answer.trim().toUpperCase() === 'YES') {
            // 清理日志
            const logsDir = path.join(__dirname, 'logs');
            if (fs.existsSync(logsDir)) {
                fs.rmSync(logsDir, { recursive: true, force: true });
                fs.mkdirSync(logsDir);
            }
            
            // 清理数据
            const dataDir = path.join(__dirname, 'data');
            if (fs.existsSync(dataDir)) {
                fs.rmSync(dataDir, { recursive: true, force: true });
                fs.mkdirSync(dataDir);
            }
            
            console.log(chalk.green('✅ 已清理所有数据'));
        } else {
            console.log(chalk.yellow('已取消'));
        }
        
        setTimeout(() => mainMenu(), 2000);
    });
}

// 快速启动模式
function checkQuickStart() {
    const args = process.argv.slice(2);
    if (args.length > 0) {
        const cmd = args[0];
        switch (cmd) {
            case 'run':
            case 'start':
                runCommand('bot.js');
                return true;
            case 'check':
                runCommand('check-before-start.js');
                return true;
            case 'setup':
                runCommand('setup.js');
                return true;
            case 'test':
                runCommand('test-obs.js');
                return true;
            default:
                console.log(chalk.yellow(`未知命令: ${cmd}`));
                console.log(chalk.gray('\n可用命令:'));
                console.log('  node start.js run    - 直接启动主程序');
                console.log('  node start.js check  - 运行启动检查');
                console.log('  node start.js setup  - 运行配置向导');
                console.log('  node start.js test   - 测试OBS功能');
                process.exit(1);
        }
    }
    return false;
}

// 主菜单
function mainMenu() {
    console.clear();
    showLogo();
    showStatus();
    showMenu();
    
    rl.question('请输入选项 (0-6): ', async (answer) => {
        const choice = answer.trim();
        
        switch (choice) {
            case '1':
                // 启动主程序前先检查
                const configExists = fs.existsSync(path.join(__dirname, 'config', 'config.json'));
                const modulesExist = fs.existsSync(path.join(__dirname, 'node_modules'));
                
                if (!configExists || !modulesExist) {
                    console.log(chalk.red('\n❌ 检测到问题:'));
                    if (!configExists) console.log('  - 配置文件不存在');
                    if (!modulesExist) console.log('  - 依赖未安装');
                    console.log(chalk.yellow('\n建议先运行"启动前检查"或"配置向导"'));
                    
                    setTimeout(() => mainMenu(), 3000);
                } else {
                    await runCommand('bot.js');
                }
                break;
                
            case '2':
                await runCommand('check-before-start.js');
                break;
                
            case '3':
                await runCommand('setup.js');
                break;
                
            case '4':
                await runCommand('test-obs.js');
                break;
                
            case '5':
                viewLogs();
                break;
                
            case '6':
                cleanData();
                break;
                
            case '0':
                console.log(chalk.cyan('\n再见！👋\n'));
                rl.close();
                process.exit(0);
                break;
                
            default:
                console.log(chalk.red('\n无效选项，请重新选择'));
                setTimeout(() => mainMenu(), 1500);
        }
    });
}

// 主函数
function main() {
    // 检查快速启动
    if (checkQuickStart()) {
        return;
    }
    
    // 检查必要文件
    if (!checkFiles()) {
        console.log(chalk.red('\n系统文件不完整，请重新下载'));
        process.exit(1);
    }
    
    // 显示主菜单
    mainMenu();
}

// 处理Ctrl+C
process.on('SIGINT', () => {
    console.log(chalk.cyan('\n\n再见！👋\n'));
    process.exit(0);
});

// 启动
main();