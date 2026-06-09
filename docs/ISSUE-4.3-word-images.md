# Issue 4.3：docx 图片提取

> PRD-004 需求 3 | 工作量：后端 3h + 前端 0.5h + 测试 1h

## 验收条件

### AC-1: docx 转换时提取图片到磁盘
- 转换 `方案/某方案.docx` 时，图片提取到 `方案/_images/某方案_media_1.png`
- 图片与原文件在同一知识库根路径下的 `_images/` 子目录
- 图片命名：`{源文件无扩展名}_{zip中原始文件名}` （如 `某方案_image1.jpeg`）
- 支持 .png, .jpeg, .gif, .bmp, .wmf（wmf 转 png）

### AC-2: .md 文件中插入图片引用
- 生成的 .md 文件包含 `![图片](_images/某方案_image1.png)` 等 Markdown 引用
- alt text 从 docx 的图片描述（description/alt text）获取，没有则用 `图片 N`
- 图片引用位于文档中图片出现的位置，而非统一堆在末尾

### AC-3: 前端显示图片计数
- 在文件列表（分类页）中，docx 文件显示 `📷 N` 标签
- 在搜索结果中同样显示

### AC-4: 图片可正常访问
- 图片通过 `/uploads/{path}/_images/{filename}` 可访问
- 浏览器直接打开图片 URL 显示正确的 MIME 类型
- `server.cjs` 静态文件配置覆盖 `_images` 目录

### AC-5: 重新转换幂等
- 多次转换同一 docx 时，`_images` 目录覆盖而非堆积
- 旧的 .md 文件也被覆盖

### AC-6: 文档正文图片显示
- 前端的 markdown 渲染（marked 或自定义渲染器）支持显示 `![](_images/...)` 图片
- 用户阅读文档时能看到嵌入的图片

## 实现方案

### 新增脚本 `lib/convert_docx_with_images.py`

```python
import zipfile, os, shutil
from docx import Document

def extract_images_from_docx(docx_path, output_dir):
    stem = os.path.splitext(os.path.basename(docx_path))[0]
    images_dir = os.path.join(output_dir, '_images')
    if os.path.exists(images_dir):
        shutil.rmtree(images_dir)
    os.makedirs(images_dir, exist_ok=True)
    
    extracted = []
    with zipfile.ZipFile(docx_path) as z:
        for name in z.namelist():
            if name.startswith('word/media/'):
                basename = os.path.basename(name)
                out_name = f"{stem}_{basename}"
                out_path = os.path.join(images_dir, out_name)
                with z.open(name) as src, open(out_path, 'wb') as dst:
                    shutil.copyfileobj(src, dst)
                extracted.append((name, out_name))
    return extracted
```

### 前端改动

文件列表渲染（`renderFilesInCategory` 和搜索结果）：
```js
const imgCount = f.image_count || 0;
const imgBadge = imgCount > 0 ? `<span class="img-badge">📷 ${imgCount}</span>` : '';
```

新增 CSS：
```css
.img-badge { font-size: 11px; color: var(--text-tertiary); margin-left: 6px; }
```

## 依赖
- `python-docx` 已安装到虚拟环境
- 生产环境只需 `python3 -m pip install python-docx`
