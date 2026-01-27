#!/usr/bin/env python3
"""
PDF Text Extraction using pymupdf4llm

Extracts text from ECMA-376 PDF files with proper markdown formatting.
Produces cleaner output than pdf.js with code fences and table formatting.

Usage:
    python scripts/ingest/extract-pdf.py <pdf-path> <output-dir> [--pages START-END]

Example:
    python scripts/ingest/extract-pdf.py ./pdfs/ECMA-376-Part1.pdf ./extracted/part1
    python scripts/ingest/extract-pdf.py ./pdfs/ECMA-376-Part1.pdf ./extracted/part1 --pages 100-200
"""

import sys
import json
import re
import os
from pathlib import Path


def extract_pdf(pdf_path: str, output_dir: str, page_range: tuple[int, int] | None = None):
    """Extract PDF to markdown using pymupdf4llm."""
    import pymupdf4llm
    import fitz  # pymupdf

    print(f"Loading PDF: {pdf_path}")

    # Get total page count
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    doc.close()

    print(f"PDF loaded: {total_pages} pages")

    # Determine pages to process
    if page_range:
        start_page, end_page = page_range
        pages = list(range(start_page - 1, min(end_page, total_pages)))
        print(f"Processing pages {start_page} to {min(end_page, total_pages)}")
    else:
        pages = None  # Process all pages
        print(f"Processing all {total_pages} pages")

    # Extract to markdown
    print("Extracting text...")
    md_text = pymupdf4llm.to_markdown(
        pdf_path,
        pages=pages,
        show_progress=True
    )

    # Create output directory
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Save raw markdown
    md_path = Path(output_dir) / "content.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_text)
    print(f"Saved markdown to {md_path}")

    # Parse sections from markdown
    sections = parse_sections(md_text, page_range[0] if page_range else 1)

    # Save sections
    sections_path = Path(output_dir) / "sections.json"
    with open(sections_path, "w", encoding="utf-8") as f:
        json.dump(sections, f, indent=2)
    print(f"Saved {len(sections)} sections to {sections_path}")

    # Save section index (without content)
    section_index = [{
        "sectionId": s["sectionId"],
        "title": s["title"],
        "depth": s["depth"],
        "parentId": s["parentId"],
        "pageStart": s["pageStart"],
        "pageEnd": s["pageEnd"],
        "contentLength": len(s["content"]),
    } for s in sections]

    index_path = Path(output_dir) / "section-index.json"
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(section_index, f, indent=2)

    # Save metadata
    metadata = {
        "totalPages": total_pages,
        "processedPages": len(pages) if pages else total_pages,
        "pageRange": list(page_range) if page_range else None,
        "sectionsFound": len(sections),
        "contentLength": len(md_text),
    }

    metadata_path = Path(output_dir) / "metadata.json"
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"\nExtraction complete!")
    print(f"  Total pages: {total_pages}")
    print(f"  Processed pages: {metadata['processedPages']}")
    print(f"  Sections found: {len(sections)}")
    print(f"  Content size: {len(md_text):,} chars")

    return md_text, sections


def parse_sections(md_text: str, start_page: int) -> list[dict]:
    """Parse section structure from markdown text."""
    sections = []

    # Section patterns for ECMA-376
    patterns = [
        # Main section with bold: **12.3.2** **Title**
        r'^\*\*(\d+(?:\.\d+)*)\*\*\s*\*\*([^*]+)\*\*',
        # Main section without bold: 12.3.2 Title
        r'^(\d+(?:\.\d+)*)\s+([A-Z][^\n]+)',
        # Annex: Annex A (normative) or **Annex A**
        r'^\*?(Annex\s+[A-Z])\*?\s*(?:\(([^)]+)\))?\s*(.*)$',
    ]

    lines = md_text.split('\n')
    current_section = None
    current_content = []
    current_page = start_page

    for line in lines:
        # Track page numbers (pymupdf4llm includes page breaks)
        if line.strip().isdigit() and len(line.strip()) <= 4:
            # Could be a page number
            try:
                page_num = int(line.strip())
                if page_num > current_page and page_num < current_page + 10:
                    current_page = page_num
            except ValueError:
                pass

        # Check for section headers
        section_match = None
        for pattern in patterns:
            match = re.match(pattern, line.strip(), re.IGNORECASE)
            if match:
                section_match = match
                break

        if section_match:
            # Save previous section
            if current_section:
                current_section["content"] = '\n'.join(current_content).strip()
                current_section["pageEnd"] = current_page
                sections.append(current_section)

            # Start new section
            groups = section_match.groups()
            section_id = groups[0]
            title = groups[1] if len(groups) > 1 else ""

            # Calculate depth
            if section_id.startswith("Annex"):
                depth = 1
            else:
                depth = section_id.count('.') + 1

            # Get parent ID
            parent_id = get_parent_section_id(section_id)

            current_section = {
                "sectionId": section_id,
                "title": (title or "").strip(),
                "pageStart": current_page,
                "pageEnd": current_page,
                "content": "",
                "depth": depth,
                "parentId": parent_id,
            }
            current_content = [line]
        elif current_section:
            current_content.append(line)

    # Don't forget the last section
    if current_section:
        current_section["content"] = '\n'.join(current_content).strip()
        current_section["pageEnd"] = current_page
        sections.append(current_section)

    return sections


def get_parent_section_id(section_id: str) -> str | None:
    """Get parent section ID from a section ID."""
    if section_id.startswith("Annex"):
        return None

    parts = section_id.split('.')
    if len(parts) <= 1:
        return None

    return '.'.join(parts[:-1])


def main():
    args = sys.argv[1:]

    if len(args) < 2:
        print("Usage: python scripts/ingest/extract-pdf.py <pdf-path> <output-dir> [--pages START-END]")
        print("")
        print("Example:")
        print("  python scripts/ingest/extract-pdf.py ./pdfs/ECMA-376-Part1.pdf ./extracted/part1")
        print("  python scripts/ingest/extract-pdf.py ./pdfs/ECMA-376-Part1.pdf ./extracted/part1 --pages 100-200")
        sys.exit(1)

    pdf_path = args[0]
    output_dir = args[1]

    # Parse page range if provided
    page_range = None
    if len(args) > 2 and args[2] == "--pages":
        if len(args) > 3:
            try:
                start, end = args[3].split("-")
                page_range = (int(start), int(end))
            except ValueError:
                print(f"Invalid page range: {args[3]}")
                print("Expected format: START-END (e.g., 100-200)")
                sys.exit(1)

    if not os.path.exists(pdf_path):
        print(f"ERROR: PDF not found: {pdf_path}")
        sys.exit(1)

    try:
        extract_pdf(pdf_path, output_dir, page_range)
    except Exception as e:
        print(f"Extraction failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
