# Issue 4.2：docx 表格保留（Markdown 表格格式）

> PRD-004 需求 2 | 工作量：3h（脚本）+ 1.5h（测试）
> **依赖**：Issue 4.3（图片提取）可以独立先行

## 验收条件

### AC-1: docx 表格转为 Markdown 表格
- 包含表格的 .docx 转换后，`.md` 文件中出现正确的 Markdown 表格语法
- 表头行识别正确（docx 中第一行通常有底纹或重复表头标记）
- 列对齐：左对齐（`|---|`），除非 docx 中指定了对齐
- 空单元格显示为空白 `| |`

### AC-2: 段落与表格保持顺序
- 文档结构 段落→表格→段落→表格 的顺序正确保留
- 表格前后的文本不丢失

### AC-3: 合并单元格处理
- 横向合并的单元格：内容合并显示 `| 内容 |`（占用一个单元格）
- 纵向合并的单元格：第一行显示内容，后续行留空 `| |`
- 用 `*斜体*` 标记合并的单元格内容

### AC-4: 表格标题保留
- docx 中表格的标题（caption）保留为 Markdown 表格上方的 `**表标题：**`
- 或无 caption 时不留额外标记

### AC-5: 嵌套表格
- 嵌套表格缩减为：标记 `*[嵌套表：N 行 x M 列]*` 并跳过深层转换
- 避免 markdown 不支持嵌套表格的问题

### AC-6: 不影响其他格式
- PDF / TXT / XLSX 等非 docx 的转换行为不变
- 纯文本 docx（无表格）转换得到的 .md 内容不变

## 实现方案：`lib/convert_docx.py`

```python
from docx import Document
from docx.oxml.ns import qn

def docx_to_markdown(filepath, output_dir=None):
    doc = Document(filepath)
    parts = []
    images = []  # for issue 4.3
    
    for element in doc.element.body:
        if element.tag.endswith('tbl'):
            # Process table
            md, imgs = table_to_markdown(element, doc, output_dir)
            parts.append(md)
            images.extend(imgs)
        elif element.tag.endswith('p'):
            # Process paragraph
            parts.append(paragraph_to_markdown(element))
    
    return '\n\n'.join(parts), images

def table_to_markdown(tbl_element, doc, output_dir):
    """Convert docx table XML to Markdown table string."""
    rows = tbl_element.findall('.//' + qn('w:tr'))
    md_lines = []
    for ri, row in enumerate(rows):
        cells = row.findall(qn('w:tc'))
        col_texts = []
        for cell in cells:
            # Get merged column span
            gridSpan = cell.find(qn('w:tcPr') + '/' + qn('w:gridSpan'))
            span = int(gridSpan.get(qn('w:val'))) if gridSpan is not None else 1
            text = cell.text.strip() if cell.text else ''
            col_texts.append(('|' if span > 1 else '', text))
        md_lines.append('| ' + ' | '.join(text for _, text in col_texts) + ' |')
        
        if ri == 0:  # header separator
            md_lines.append('|' + '|'.join('---' for _ in col_texts) + '|')
    
    return '\n'.join(md_lines), []
```

表格支持参考 `python-docx` 官方文档：`docx.table.Table`。
