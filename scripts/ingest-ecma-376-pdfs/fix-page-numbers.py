#!/usr/bin/env python3
"""
Fix page numbers in embedded JSON files by re-parsing content.md.

This avoids re-running the full pipeline (re-chunk, re-embed) which costs API credits.

Usage:
    python scripts/ingest/fix-page-numbers.py <part-number>

Example:
    python scripts/ingest/fix-page-numbers.py 1
"""

import sys
import json
import re
from pathlib import Path


def parse_sections_for_pages(md_text: str, start_page: int = 1) -> dict[str, int]:
    """Parse section IDs and their page numbers from markdown."""
    section_pages = {}

    # Bold section header patterns
    patterns = [
        # Part 1 style: **12.3.2** **Title**
        r'^\*\*(\d+(?:\.\d+)*)\*\*\s*\*\*([^*]+)\*\*$',
        # Part 2/3/4 style: # **12.3.2. Title** or # **12. Title**
        r'^#+\s*\*\*(\d+(?:\.\d+)*)\.?\s+([^*]+)\*\*$',
        # Annex
        r'^\*\*(Annex\s+[A-Z])\*\*\s*(?:\*\*)?(?:\(([^)]+)\))?(?:\*\*)?\s*(.*)$',
    ]

    toc_pattern = r'^\d+(?:\.\d+)*\s+.+\.{2,}\s*\d+$'
    arabic_page_pattern = r'^(\d+)$'
    header_pattern = r'^ECMA-376 Part \d'

    lines = md_text.split('\n')
    current_page = start_page

    for line in lines:
        stripped = line.strip()

        # Skip headers
        if re.match(header_pattern, stripped):
            continue

        # Track page numbers
        if re.match(arabic_page_pattern, stripped):
            page_num = int(stripped)
            if page_num >= current_page and page_num < current_page + 50:
                current_page = page_num
                continue

        # Skip TOC entries
        if re.match(toc_pattern, stripped):
            continue

        # Check for section headers
        for pattern in patterns:
            match = re.match(pattern, stripped, re.IGNORECASE)
            if match:
                section_id = match.group(1)
                # +1 to match TOC page numbers
                section_pages[section_id] = current_page + 1
                break

    return section_pages


def fix_embedded_file(part_number: int):
    """Fix page numbers in embedded JSON file."""
    base_dir = Path("dev/data")
    content_path = base_dir / f"extracted/part{part_number}/content.md"
    embedded_path = base_dir / f"embedded/part{part_number}-embedded.json"

    if not content_path.exists():
        print(f"ERROR: Content file not found: {content_path}")
        return False

    if not embedded_path.exists():
        print(f"ERROR: Embedded file not found: {embedded_path}")
        return False

    print(f"Processing part {part_number}...")

    # Parse content.md for section page numbers
    print(f"  Parsing {content_path}...")
    with open(content_path) as f:
        content = f.read()

    section_pages = parse_sections_for_pages(content)
    print(f"  Found {len(section_pages)} sections with page numbers")

    # Load embedded chunks
    print(f"  Loading {embedded_path}...")
    with open(embedded_path) as f:
        chunks = json.load(f)

    print(f"  Loaded {len(chunks)} chunks")

    # Update page numbers
    updated = 0
    missing = set()
    for chunk in chunks:
        section_id = chunk.get("sectionId")
        if section_id and section_id in section_pages:
            old_page = chunk.get("pageNumber")
            new_page = section_pages[section_id]
            if old_page != new_page:
                chunk["pageNumber"] = new_page
                updated += 1
        elif section_id:
            missing.add(section_id)

    print(f"  Updated {updated} chunks")
    if missing:
        print(f"  Warning: {len(missing)} sections not found in parsed content")

    # Save updated file
    print(f"  Saving {embedded_path}...")
    with open(embedded_path, "w") as f:
        json.dump(chunks, f, indent=2)

    print(f"  Done!")
    return True


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/ingest/fix-page-numbers.py <part-number|all>")
        print("")
        print("Examples:")
        print("  python scripts/ingest/fix-page-numbers.py 1")
        print("  python scripts/ingest/fix-page-numbers.py all")
        sys.exit(1)

    arg = sys.argv[1]

    if arg == "all":
        parts = [1, 2, 3, 4]
    else:
        try:
            parts = [int(arg)]
        except ValueError:
            print(f"Invalid part number: {arg}")
            sys.exit(1)

    for part in parts:
        if not fix_embedded_file(part):
            sys.exit(1)
        print()

    print("All done! Now run upload.ts to update the database.")


if __name__ == "__main__":
    main()
