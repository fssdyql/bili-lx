const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

console.log(chalk.cyan.bold('\n=== 启动前检查 ===\n'));

let hasError = false;
let hasWarning = false;

// ==================== 1. Node版本检查 ====================
console.log(chalk.yellow('1. 检查运行环境...'));

const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));

if (majorVersion >= 14) {
    console.log(chalk.green(`  ✅ Node.js版本: ${nodeVersion}`));
} else {
    console.log(chalk.red(`  ❌ Node.js版本过低: ${nodeVersion} (需要 v14.0.0+)`));
    hasError = true;
}

console.log(`  📁 工作目录: ${process.cwd()}`);
console.log(`  💻 操作系统: ${process.platform}`);

// ==================== 2. 依赖检查 ====================
console.log(chalk.yellow('\n2. 检查依赖包...'));

const packageJsonPath = path.join(__dirname, 'package.json');
if (!fs.existsSync(packageJsonPath)) {
    console.log(chalk.red('  ❌ package.json不存在'));
    hasError = true;
} else {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const dependencies = packageJson.dependencies || {};
    
    let missingDeps = [];
    
    for (const [dep, version] of Object.entries(dependencies)) {
        try {
            require.resolve(dep);
            console.log(chalk.green(`  ✅ ${dep} @ ${version}`));
        } catch (e) {
            console.log(chalk.red(`  ❌ ${dep} - 未安装`));
            missingDeps.push(dep);
            hasError = true;
        }
    }
    
    if (missingDeps.length > 0) {
        console.log(chalk.yellow('\n  请运行以下命令安装依赖:'));
        console.log(chalk.cyan('  npm install'));
    }
}

// ==================== 3. 配置文件检查 ====================
console.log(chalk.yellow('\n3. 检查配置文件...'));

const configDir = path.join(__dirname, 'config');
const configFiles = [
    { name: 'config.json', required: true },
    { name: 'whitelist.json', required: false },
    { name: 'blacklist.json', required: false },
    { name: 'cookies.json', required: false }
];

configFiles.forEach(file => {
    const filePath = path.join(configDir, file.name);
    if (fs.existsSync(filePath)) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            JSON.parse(content); // 验证JSON格式
            console.log(chalk.green(`  ✅ ${file.name}`));
            
            // 特殊检查
            if (file.name === 'config.json') {
                const config = JSON.parse(content);
                console.log(chalk.gray(`     房间号: ${config.room?.roomId || '未设置'}`));
                console.log(chalk.gray(`     API状态: ${config.lxmusic?.api?.enabled ? '启用' : '禁用'}`));
                console.log(chalk.gray(`     OBS状态: ${config.obs?.enabled ? '启用' : '禁用'}`));
            } else if (file.name === 'cookies.json') {
                const cookies = JSON.parse(content);
                if (Array.isArray(cookies) && cookies.length > 0) {
                    console.log(chalk.gray(`     Cookie数量: ${cookies.length}`));
                }
            }
            
        } catch (e) {
            console.log(chalk.red(`  ❌ ${file.name} - JSON格式错误`));
            if (file.required) hasError = true;
        }
    } else {
        if (file.required) {
            console.log(chalk.red(`  ❌ ${file.name} - 不存在（必需）`));
            hasError = true;
        } else {
            console.log(chalk.yellow(`  ⚠️ ${file.name} - 不存在（可选）`));
            hasWarning = true;
        }
    }
});

// ==================== 4. 目录结构检查 ====================
console.log(chalk.yellow('\n4. 检查目录结构...'));

const requiredDirs = [
    'modules',
    'obs-display',
    'obs-display/assets',
    'config',
    'logs',
    'data'
];

requiredDirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        console.log(chalk.green(`  ✅ ${dir}/ (${files.length}个文件)`));
    } else {
        console.log(chalk.yellow(`  ⚠️ ${dir}/ - 不存在，将自动创建`));
        hasWarning = true;
    }
});

// ==================== 5. 核心模块检查 ====================
console.log(chalk.yellow('\n5. 检查核心模块...'));

const coreModules = [
    { path: 'bot.js', name: '主程序' },
    { path: 'modules/logger.js', name: '日志模块' },
    { path: 'modules/bilibili-danmu.js', name: 'B站弹幕模块' },
    { path: 'modules/lxmusic-api.js', name: 'LX Music模块' },
    { path: 'obs-display/server.js', name: 'OBS服务模块' }
];

coreModules.forEach(module => {
    const modulePath = path.join(__dirname, module.path);
    if (fs.existsSync(modulePath)) {
        const stats = fs.statSync(modulePath);
        console.log(chalk.green(`  ✅ ${module.name} - ${module.path} (${(stats.size/1024).toFixed(1)}KB)`));
    } else {
        console.log(chalk.red(`  ❌ ${module.name} - ${module.path} 不存在`));
        hasError = true;
    }
});

// ==================== 6. LX Music检查 ====================
console.log(chalk.yellow('\n6. 检查LX Music...'));

const configPath = path.join(configDir, 'config.json');
if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const apiConfig = config.lxmusic?.api;
    
    if (apiConfig?.enabled) {
        console.log(chalk.blue(`  ℹ️ API配置: ${apiConfig.host}:${apiConfig.port}`));
        console.log(chalk.gray('  请确保:'));
        console.log(chalk.gray('  1. LX Music已启动'));
        console.log(chalk.gray('  2. 已开启API服务（设置→API）'));
        console.log(chalk.gray(`  3. 端口设置为 ${apiConfig.port}`));
    } else {
        console.log(chalk.yellow('  ⚠️ API功能已禁用'));
        hasWarning = true;
    }
}

// ==================== 7. 端口占用检查 ====================
console.log(chalk.yellow('\n7. 检查端口...'));

function checkPortSync(port) {
    try {
        const net = require('net');
        const server = net.createServer();
        
        try {
            server.listen(port);
            server.close();
            return true;
        } catch (e) {
            return false;
        }
    } catch (e) {
        return null;
    }
}

const portsToCheck = [
    { port: 8888, name: 'OBS服务' },
    { port: 23330, name: 'LX Music API' }
];

portsToCheck.forEach(({ port, name }) => {
    const result = checkPortSync(port);
    if (result === true) {
        console.log(chalk.green(`  ✅ 端口 ${port} (${name}) - 可用`));
    } else if (result === false) {
        console.log(chalk.yellow(`  ⚠️ 端口 ${port} (${name}) - 被占用`));
        if (port === 23330) {
            console.log(chalk.gray('     可能LX Music已在运行'));
        }
    } else {
        console.log(chalk.gray(`  ⓘ 端口 ${port} (${name}) - 无法检查`));
    }
});

// ==================== 8. 总结 ====================
console.log(chalk.cyan('\n=== 检查结果 ===\n'));

if (hasError) {
    console.log(chalk.red('❌ 发现错误，请先解决上述问题'));
    console.log(chalk.yellow('\n建议操作:'));
    console.log('1. 运行 npm install 安装依赖');
    console.log('2. 检查配置文件是否正确');
    console.log('3. 确保所有必需文件存在');
    process.exit(1);
} else if (hasWarning) {
    console.log(chalk.yellow('⚠️ 有一些警告，但可以继续运行'));
    console.log(chalk.gray('\n可选操作:'));
    console.log('1. 添加cookies.json以获取完整功能');
    console.log('2. 配置白名单和黑名单');
} else {
    console.log(chalk.green('✅ 检查通过，可以启动！'));
}

console.log(chalk.cyan('\n启动命令:'));
console.log(chalk.white('  npm start'));

console.log(chalk.cyan('\n其他命令:'));
console.log(chalk.white('  node test-obs.js    - 测试OBS显示'));
console.log(chalk.white('  node setup.js       - 配置向导'));

console.log();

// 如果没有错误，返回成功
if (!hasError) {
    process.exit(0);
}