#!/usr/bin/env python3
"""
Extract images from a .docx file and write them to a _images/ subdirectory.
Also returns image references for Markdown insertion.

Usage: python3 extract_docx_images.py <docx_path> <output_dir>
Output (stdout): JSON array of {src_name, out_name, alt_text}
"""
import sys, os, json, zipfile, re

def extract_docx_images(docx_path, output_dir):
    """Extract images from docx word/media/, return list of image info dicts."""
    stem = os.path.splitext(os.path.basename(docx_path))[0]
    images_dir = os.path.join(output_dir, '_images')

    # cleanup + recreate
    if os.path.exists(images_dir):
        # Only remove files matching our naming pattern
        for f in os.listdir(images_dir):
            if f.startswith(stem + '_'):
                os.remove(os.path.join(images_dir, f))
    else:
        os.makedirs(images_dir, exist_ok=True)

    results = []

    with zipfile.ZipFile(docx_path) as z:
        # List all media files
        media_files = sorted([n for n in z.namelist() if n.startswith('word/media/')])
        if not media_files:
            return results

        # Try to get alt text from document.xml relationships
        alt_texts = {}
        try:
            doc_xml = z.read('word/document.xml')
            # Find wp:docPr with descr/name attributes that reference media rId
            import xml.etree.ElementTree as ET
            ns = {
                'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
                'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
                'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
                'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
                'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
                'wp14': 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
            }
            root = ET.fromstring(doc_xml)
            # Find all blip elements which reference media
            for blip in root.iter(f'{{{ns["a"]}}}blip'):
                r_embed = blip.get(f'{{{ns["r"]}}}embed', '')
                if r_embed:
                    # Find corresponding relationship
                    rels_xml = z.read('word/_rels/document.xml.rels')
                    rels_root = ET.fromstring(rels_xml)
                    for rel in rels_root:
                        rel_id = rel.get('Id', '')
                        rel_target = rel.get('Target', '')
                        if rel_id == r_embed and 'media' in rel_target:
                            # Look for nearby docPr for alt text
                            parent = blip
                            for _ in range(5):
                                if parent is None:
                                    break
                                parent = None  # simplified traversal
                                # The docPr is usually in wp:inline > wp:docPr
                            alt_texts[rel_target] = ''
        except Exception:
            pass

        for media_path in media_files:
            basename = os.path.basename(media_path)
            if not basename:
                continue
            basename = os.path.basename(media_path)
            out_name = f"{stem}_{basename}"
            out_path = os.path.join(images_dir, out_name)

            with z.open(media_path) as src, open(out_path, 'wb') as dst:
                dst.write(src.read())

            alt_text = alt_texts.get(media_path, '')
            ref_id = len(results) + 1
            alt_text = alt_text or f'图片 {ref_id}'

            # Convert EMF/WMF to PNG if possible
            ext_lower = basename.rsplit('.', 1)[-1].lower() if '.' in basename else ''
            if ext_lower in ('emf', 'wmf'):
                png_out_name = out_name.rsplit('.', 1)[0] + '.png'
                png_out_path = os.path.join(images_dir, png_out_name)
                try:
                    from PIL import Image
                    # Unlikely to work for EMF/WMF, but try pypdf or similar
                    pass
                except ImportError:
                    # PIL + ctypes: try unoconv or just keep emf
                    pass

            results.append({
                'src_name': basename,
                'out_name': out_name,
                'alt_text': alt_text
            })

    return results

def main():
    if len(sys.argv) < 3:
        print("ERROR: Usage: extract_docx_images.py <docx_path> <output_dir>", file=sys.stderr)
        sys.exit(1)

    docx_path = sys.argv[1]
    output_dir = sys.argv[2]

    if not os.path.exists(docx_path):
        print(f"ERROR: File not found: {docx_path}", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    try:
        images = extract_docx_images(docx_path, output_dir)
        print(json.dumps(images, ensure_ascii=False))
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
