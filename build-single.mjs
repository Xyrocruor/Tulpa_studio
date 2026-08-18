/* 筑灵 · Tulpa Studio — 单文件打包脚本
 * 把 index.html + css/style.css + js/data.js + js/app.js
 * 内联为一个自包含的 HTML 文件，可用于任意托管/直接分享。
 * 用法：node build-single.mjs   （在项目根目录运行）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, 'dist');

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const dataJs = fs.readFileSync(path.join(root, 'js', 'data.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

// 注意：必须用替换函数而非字符串，否则代码中的 $、$$、$' 等会被 String.replace 当作模式解释
html = html.replace(
  '<link rel="stylesheet" href="css/style.css">',
  () => '<style>\n/* 内联打包：css/style.css */\n' + css + '\n</style>'
);
html = html.replace(
  '<script src="js/data.js"></script>',
  () => '<script>\n/* 内联打包：js/data.js */\n' + dataJs + '\n</script>'
);
html = html.replace(
  '<script src="js/app.js"></script>',
  () => '<script>\n/* 内联打包：js/app.js */\n' + appJs + '\n</script>'
);

fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'tulpa-studio.html');
fs.writeFileSync(out, html);

const sizeKb = (fs.statSync(out).size / 1024).toFixed(1);
console.log('✓ 已生成 ' + out + '（' + sizeKb + ' KB，单文件自包含）');
