from __future__ import annotations

import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "content" / "legal" / "terms-of-service-2026-07-10.txt"
OUTPUT = ROOT / "public" / "legal" / "theta-space-terms-of-service-2026-07-10.pdf"
EFFECTIVE_DATE = "July 10, 2026"
TITLE = "Theta-Space Terms of Service"

PAGE_WIDTH, PAGE_HEIGHT = LETTER
MARGIN = 0.72 * inch
TEXT = colors.HexColor("#172033")
MUTED = colors.HexColor("#667085")
GOLD = colors.HexColor("#B48A18")
LINE = colors.HexColor("#D9C98E")


def page_chrome(canvas, document):
    canvas.saveState()
    canvas.setTitle(TITLE)
    canvas.setAuthor("Theta-Space")
    canvas.setSubject(f"Terms of Service effective {EFFECTIVE_DATE}")

    if document.page > 1:
        canvas.setFont("Helvetica-Bold", 8.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN, PAGE_HEIGHT - 0.42 * inch, TITLE)
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.6)
        canvas.line(MARGIN, PAGE_HEIGHT - 0.50 * inch, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 0.50 * inch)

    footer = f"{TITLE} - Effective {EFFECTIVE_DATE}"
    page_number = f"Page {document.page}"
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 0.38 * inch, footer)
    canvas.drawRightString(PAGE_WIDTH - MARGIN, 0.38 * inch, page_number)
    canvas.restoreState()


def build_story(lines):
    samples = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TermsTitle",
        parent=samples["Title"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=27,
        alignment=TA_CENTER,
        textColor=TEXT,
        spaceAfter=10,
    )
    meta_style = ParagraphStyle(
        "TermsMeta",
        parent=samples["BodyText"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=14,
        alignment=TA_CENTER,
        textColor=MUTED,
        spaceAfter=2,
    )
    intro_style = ParagraphStyle(
        "TermsIntro",
        parent=samples["BodyText"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=14,
        alignment=TA_LEFT,
        textColor=TEXT,
        spaceAfter=8,
    )
    heading_style = ParagraphStyle(
        "TermsHeading",
        parent=samples["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12.5,
        leading=16,
        textColor=TEXT,
        spaceBefore=9,
        spaceAfter=5,
        keepWithNext=True,
    )
    body_style = ParagraphStyle(
        "TermsBody",
        parent=samples["BodyText"],
        fontName="Helvetica",
        fontSize=9.15,
        leading=13.2,
        textColor=TEXT,
        spaceAfter=5.5,
        allowWidows=0,
        allowOrphans=0,
    )

    story = [Paragraph(TITLE, title_style)]
    for line in lines[1:6]:
        story.append(Paragraph(line, meta_style))
    story.extend([Spacer(1, 9), Paragraph(lines[6], intro_style), Paragraph(lines[7], intro_style), Spacer(1, 3)])

    for line in lines[8:]:
        if re.match(r"^\d+\.\s+", line):
            story.append(Paragraph(line, heading_style))
        else:
            story.append(Paragraph(line, body_style))
    return story


def main():
    lines = [line.strip() for line in SOURCE.read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    if len(lines) < 50 or lines[0] != "Terms of Service":
        raise RuntimeError("Terms source is incomplete or has an unexpected heading.")
    if any(ord(character) > 127 for line in lines for character in line):
        raise RuntimeError("Terms source must remain ASCII-safe for the bundled PDF fonts.")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=LETTER,
        rightMargin=MARGIN,
        leftMargin=MARGIN,
        topMargin=0.68 * inch,
        bottomMargin=0.62 * inch,
        title=TITLE,
        author="Theta-Space",
        subject=f"Terms of Service effective {EFFECTIVE_DATE}",
    )
    document.build(build_story(lines), onFirstPage=page_chrome, onLaterPages=page_chrome)
    print(f"Generated {OUTPUT}")


if __name__ == "__main__":
    main()
