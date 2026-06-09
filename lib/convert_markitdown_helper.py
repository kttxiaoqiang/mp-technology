#!/home/zhang/.local/python3.10/bin/python3.10
"""
Helper script: uses MarkItDown to convert a single file to Markdown.
Called as a subprocess by convert_markitdown.py.
"""
import sys, os
from markitdown import MarkItDown

def main():
    if len(sys.argv) < 2:
        print("ERROR: Missing file path", file=sys.stderr)
        sys.exit(1)

    path = sys.argv[1]
    if not os.path.exists(path):
        print(f"ERROR: File not found: {path}", file=sys.stderr)
        sys.exit(1)

    try:
        md = MarkItDown()
        # Suppress plugin warnings (ffmpeg etc.)
        import warnings
        warnings.filterwarnings('ignore')
        result = md.convert(path)
        print(result.text_content)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
