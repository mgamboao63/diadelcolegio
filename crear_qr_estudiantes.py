import base64
import io
import json
import re
import zipfile
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "outputs" / "estudiantes_firebase" / "estudiantes-firebase.json"
OUT_DIR = ROOT / "output" / "pdf"
IMG_DIR = OUT_DIR / "qr_estudiantes_imagenes"
PDF_PATH = OUT_DIR / "QR_estudiantes_por_curso.pdf"
ZIP_PATH = OUT_DIR / "QR_estudiantes_imagenes.zip"


def safe_name(text):
    text = re.sub(r"[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ._-]+", "_", text.strip())
    return text.strip("_") or "estudiante"


def fit_text(c, text, max_width, max_size=8.2, min_size=5.8, bold=True):
    font = "Helvetica-Bold" if bold else "Helvetica"
    size = max_size
    while size > min_size and stringWidth(text, font, size) > max_width:
        size -= 0.2
    c.setFont(font, size)
    return size


def make_qr(identifier):
    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=4)
    qr.add_data(identifier)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white").convert("RGB")


def font(size, bold=False):
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def fit_pil_font(draw, text, max_width, max_size=32, min_size=19, bold=True):
    for size in range(max_size, min_size - 1, -1):
        selected = font(size, bold)
        if draw.textbbox((0, 0), text, font=selected)[2] <= max_width:
            return selected
    return font(min_size, bold)


def make_card(student, qr_img):
    width, height = 900, 780
    card = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(card)
    draw.rectangle((1, 1, width - 2, height - 2), outline="#AAB4C0", width=3)
    qr_size = 520
    card.paste(qr_img.resize((qr_size, qr_size), Image.Resampling.NEAREST), ((width - qr_size) // 2, 22))
    name = str(student.get("nombre", "")).strip()
    draw.text((width / 2, 590), name, font=fit_pil_font(draw, name, width - 60), fill="#172B4D", anchor="mm")
    draw.text((width / 2, 650), f'Curso {student.get("curso", "")}', font=font(31, True), fill="#0B6E4F", anchor="mm")
    draw.text((width / 2, 708), f'ID: {student.get("id", "")}', font=font(24), fill="#52606D", anchor="mm")
    return card


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    def course_key(student):
        course = str(student.get("curso", "")).replace(".0", "").strip()
        return (int(course) if course.isdigit() else 99999, student.get("nombre", ""), student.get("id", ""))
    students = sorted(data.values(), key=course_key)

    for old in IMG_DIR.glob("*.png"):
        old.unlink()

    qr_images = {}
    for student in students:
        identifier = str(student["id"]).strip()
        img = make_qr(identifier)
        card = make_card(student, img)
        qr_images[identifier] = card
        filename = f'{safe_name(student.get("curso", "SIN_CURSO"))}_{safe_name(identifier)}_{safe_name(student.get("nombre", ""))}.png'
        card.save(IMG_DIR / filename, "PNG", optimize=True)

    page_w, page_h = A4
    margin_x, margin_y = 7 * mm, 7 * mm
    cols, rows = 3, 5
    card_w = (page_w - 2 * margin_x) / cols
    card_h = (page_h - 2 * margin_y) / rows
    c = canvas.Canvas(str(PDF_PATH), pagesize=A4, pageCompression=1)
    c.setTitle("QR de estudiantes por curso")
    c.setAuthor("Colegio Brasilia Bosa IED")

    for index, student in enumerate(students):
        slot = index % (cols * rows)
        if slot == 0 and index:
            c.showPage()
        col = slot % cols
        row = slot // cols
        x = margin_x + col * card_w
        y = page_h - margin_y - (row + 1) * card_h

        img_buffer = io.BytesIO()
        qr_images[str(student["id"]).strip()].save(img_buffer, "PNG")
        img_buffer.seek(0)
        from reportlab.lib.utils import ImageReader
        c.drawImage(ImageReader(img_buffer), x, y, card_w, card_h, preserveAspectRatio=False, mask="auto")

    c.save()

    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(IMG_DIR.glob("*.png")):
            archive.write(path, arcname=path.name)

    print(json.dumps({
        "students": len(students),
        "pages": (len(students) + cols * rows - 1) // (cols * rows),
        "pdf": str(PDF_PATH),
        "zip": str(ZIP_PATH),
        "images": len(list(IMG_DIR.glob("*.png"))),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
