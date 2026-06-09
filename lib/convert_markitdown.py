#!/usr/bin/env python3
"""
Document to Markdown converter using system tools:
  - PDF → pdftotext (poppler-utils)
  - DOCX → python-docx for tables + image extraction (via extract_docx_images.py)
  - All formats → LibreOffice --convert-to txt (fallback)
Output: 'OK' then markdown content on stdout, errors on stderr.
"""
import subprocess, sys, os, tempfile, json

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# ── MarkItDown (Python >=3.10) constants ──
MARKITDOWN_PYTHON = '/home/zhang/.local/python3.10/bin/python3.10'
MARKITDOWN_HELPER = os.path.join(SCRIPT_DIR, 'convert_markitdown_helper.py')

def convert_pdf_pdftotext(path):
    """Convert PDF to text using pdftotext with layout preservation."""
    result = subprocess.run(
        ['pdftotext', '-layout', path, '-'],
        capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0:
        # Fallback: try pdftohtml then strip HTML tags
        try:
            html_result = subprocess.run(
                ['pdftohtml', '-stdout', '-noframes', path],
                capture_output=True, text=True, timeout=120
            )
            if html_result.returncode == 0 and html_result.stdout.strip():
                # Strip HTML tags for plain text
                import re
                text = re.sub(r'<[^>]+>', ' ', html_result.stdout)
                text = re.sub(r'\s+', ' ', text).strip()
                if text:
                    return text
        except Exception:
            pass
        raise RuntimeError(f"pdftotext failed: {result.stderr.strip()}")
    return result.stdout

def convert_libreoffice(path):
    """Convert any document to text using LibreOffice."""
    outdir = tempfile.mkdtemp(prefix='kb_convert_')
    try:
        result = subprocess.run(
            ['libreoffice', '--headless', '--convert-to', 'txt:Text',
             '--outdir', outdir, path],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode != 0:
            raise RuntimeError(f"LibreOffice failed: {result.stderr.strip()}")

        import glob
        txt_files = glob.glob(os.path.join(outdir, '*.txt'))
        if not txt_files:
            raise RuntimeError("LibreOffice produced no output")

        with open(txt_files[0], 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
        return content
    finally:
        import shutil
        shutil.rmtree(outdir, ignore_errors=True)

def convert_docx(path):
    """
    Convert DOCX to Markdown with tables and images.
    Uses python-docx for structure + extract_docx_images.py for images.
    """
    output_dir = os.path.dirname(path)

    # Step 1: Extract images
    extract_script = os.path.join(SCRIPT_DIR, 'extract_docx_images.py')
    try:
        result = subprocess.run(
            ['python3', extract_script, path, output_dir],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode == 0:
            images = json.loads(result.stdout.strip())
        else:
            images = []
    except Exception:
        images = []

    img_map = {}  # original_name -> markdown reference
    for img in images:
        md_ref = f'![{img["alt_text"]}](_images/{img["out_name"]})'
        img_map[img['src_name']] = md_ref

    # Step 2: Parse document structure with python-docx
    try:
        from docx import Document
        from docx.oxml.ns import qn
        import xml.etree.ElementTree as ET

        doc = Document(path)
        parts = []
        img_idx = 0

        # Build ordered list of image refs from the extracted map
        img_refs_ordered = [img for img in images if img['src_name']]

        # We need to iterate through body elements in order
        body = doc.element.body

        for child in body:
            tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag

            if tag == 'p':
                # Paragraph
                text = _paragraph_to_text(child)
                if '<!--IMG-->' in text:
                    # Insert image reference at this position
                    if img_idx < len(img_refs_ordered):
                        img_info = img_refs_ordered[img_idx]
                        parts.append(f'![{img_info["alt_text"]}](_images/{img_info["out_name"]})')
                        img_idx += 1
                elif text.strip():
                    parts.append(text)

            elif tag == 'tbl':
                # Table
                md_table, _ = _table_to_markdown(child)
                parts.append(md_table)

            elif tag == 'sdt':
                # Structured document tag (might contain tables or images)
                text = _sdt_to_text(child)
                if text.strip():
                    parts.append(text)

        if img_refs_ordered and img_idx < len(img_refs_ordered):
            # Some images remain that weren't matched in document body
            remaining = img_refs_ordered[img_idx:]
            refs = '\n'.join(f'![{r["alt_text"]}](_images/{r["out_name"]})' for r in remaining)
            parts.append(f'\n---\n### 文档图片\n{refs}')

        content = '\n\n'.join(parts)

    except ImportError:
        # Fallback if python-docx not available
        content = convert_libreoffice(path)
    except Exception as e:
        # Fallback on error
        import traceback
        error_detail = traceback.format_exc()
        content = convert_libreoffice(path)

    return content

def _paragraph_to_text(p_element):
    """Extract text from a paragraph element, preserving basic formatting."""
    ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    texts = []
    ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

    # Check paragraph style for heading detection
    pPr = p_element.find(f'{{{ns}}}pPr')
    pStyle = pPr.find(f'{{{ns}}}pStyle') if pPr is not None else None
    style_val = pStyle.get(f'{{{ns}}}val') if pStyle is not None else None

    # Check for images in this paragraph
    has_image = False
    for run in p_element.findall(f'.//{{{ns}}}r'):
        # Check for drawing (image) via blip
        blip = run.find(f'.//{{http://schemas.openxmlformats.org/drawingml/2006/main}}blip')
        if blip is not None:
            has_image = True
            continue
        t_elem = run.find(f'{{{ns}}}t')
        if t_elem is not None and t_elem.text:
            texts.append(t_elem.text)

    text = ''.join(texts)

    if has_image:
        # This paragraph contains an image; mark it for later replacement
        return text if text.strip() else '<!--IMG-->'

    # Apply heading markup
    if style_val and style_val.startswith('Heading'):
        level = style_val.replace('Heading', '')
        if level.isdigit():
            level = int(level)
            if 1 <= level <= 6:
                text = '#' * level + ' ' + text
        return text

    return text

def _table_to_markdown(tbl_element):
    """Convert a docx table element to Markdown table string."""
    ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    rows = tbl_element.findall(f'.//{{{ns}}}tr')

    md_lines = []
    max_cols = 0
    row_data = []

    for row in rows:
        cells = row.findall(f'{{{ns}}}tc')
        col_texts = []
        col_count = 0
        for cell in cells:
            tcPr = cell.find(f'{{{ns}}}tcPr')
            grid_span_el = tcPr.find(f'{{{ns}}}gridSpan') if tcPr is not None else None
            span = int(grid_span_el.get(f'{{{ns}}}val')) if grid_span_el is not None else 1

            # Extract cell text
            cell_texts = []
            for p in cell.findall(f'{{{ns}}}p'):
                t_elems = p.findall(f'.//{{{ns}}}t')
                line = ''.join(t.text or '' for t in t_elems).strip()
                if line:
                    cell_texts.append(line)
            # Check for vertical merge
            vMerge = tcPr.find(f'{{{ns}}}vMerge') if tcPr is not None else None
            if vMerge is not None and vMerge.get(f'{{{ns}}}val') == 'continue':
                col_texts.append('')
            else:
                text = ' '.join(cell_texts)
                col_texts.append(text)

            col_count += span

        max_cols = max(max_cols, col_count)
        row_data.append(col_texts)

    # Build Markdown table
    if not row_data:
        return '*(空表格)*\n', []

    # Header row
    first_row = row_data[0]
    while len(first_row) < max_cols:
        first_row.append('')
    md_lines.append('| ' + ' | '.join(first_row) + ' |')

    # Separator
    md_lines.append('| ' + ' | '.join(['---'] * max_cols) + ' |')

    # Data rows
    for row in row_data[1:]:
        while len(row) < max_cols:
            row.append('')
        md_lines.append('| ' + ' | '.join(row) + ' |')

    return '\n'.join(md_lines), []

def _sdt_to_text(sdt_element):
    """Extract text from a structured document tag."""
    ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    texts = []
    for t in sdt_element.findall(f'.//{{{ns}}}t'):
        if t.text:
            texts.append(t.text)
    return ''.join(texts)

def main():
    if len(sys.argv) < 2:
        print("ERROR: Usage: convert_docs.py <file_path>", file=sys.stderr)
        sys.exit(1)

    filepath = sys.argv[1]

    if not os.path.exists(filepath):
        print(f"ERROR: File not found: {filepath}", file=sys.stderr)
        sys.exit(1)

    try:
        content = None
        # 1) Try MarkItDown first (best quality, supports many formats)
        if os.path.exists(MARKITDOWN_PYTHON) and os.path.exists(MARKITDOWN_HELPER):
            md_result = subprocess.run(
                [MARKITDOWN_PYTHON, MARKITDOWN_HELPER, filepath],
                capture_output=True, text=True, timeout=180
            )
            if md_result.returncode == 0 and md_result.stdout.strip():
                content = md_result.stdout.strip()

        # 2) Fallback: pdftotext for PDF / python-docx for DOCX / LibreOffice
        if content is None:
            ext = os.path.splitext(filepath)[1].lower()
            if ext == '.pdf':
                content = convert_pdf_pdftotext(filepath)
            elif ext == '.docx':
                content = convert_docx(filepath)
            else:
                content = convert_libreoffice(filepath)

        print('OK')
        sys.stdout.flush()
        sys.stdout.write(content)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr, flush=True)
        import traceback
        print(traceback.format_exc(), file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == '__main__':
    main()
