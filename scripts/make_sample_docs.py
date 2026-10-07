"""Generates the two fictional sample documents in public/samples/.

All names, numbers and codes are made up. They match the seeded demo data (policy POL-300577
and POL-100245, Maria Lopez) so you can walk the whole flow: look up the policy, upload the file,
let the AI read it, apply the values.

Run from the repo root:   python scripts/make_sample_docs.py
Needs Pillow:             pip install pillow
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "public" / "samples"
W, H = 1240, 1754  # A4 at 150 dpi
INK, MUTED, RULE, TINT = (30, 41, 59), (100, 116, 139), (203, 213, 225), (241, 245, 249)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for name in (["arialbd.ttf", "DejaVuSans-Bold.ttf"] if bold else ["arial.ttf", "DejaVuSans.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def money(v: float) -> str:
    return f"${v:,.2f}"


def right(d: ImageDraw.ImageDraw, x: int, y: int, text: str, f, fill=INK):
    d.text((x - d.textlength(text, font=f), y), text, font=f, fill=fill)


def footer(d: ImageDraw.ImageDraw):
    d.text((80, H - 90), "SAMPLE DOCUMENT: all names, numbers and codes are fictitious. Created for the ClaimEase demo.", font=font(20), fill=MUTED)


def itemized_bill() -> Image.Image:
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 190], fill=(15, 76, 129))
    d.text((80, 50), "LAKESIDE MEDICAL GROUP", font=font(50, True), fill="white")
    d.text((80, 118), "Lakeside Clinic - South Austin  |  4120 S Congress Ave, Austin, TX 78745", font=font(24), fill=(214, 228, 244))
    d.text((80, 150), "Phone (512) 555-0142   |   NPI 1234567893   |   Tax ID 74-1234567", font=font(24), fill=(214, 228, 244))

    d.text((80, 240), "ITEMIZED STATEMENT", font=font(40, True), fill=INK)
    right(d, W - 80, 236, "Statement date: 09/18/2026", font(26))
    right(d, W - 80, 274, "Statement #: LMG-208841", font(26))

    d.rectangle([80, 340, W - 80, 560], fill=TINT)
    rows = [
        ("Patient", "Maria Lopez"), ("Date of birth", "04/12/1988"), ("Member ID", "MBR-778812"),
        ("Plan", "Health (PPO)  -  Policy POL-300577"),
    ]
    for i, (k, v) in enumerate(rows):
        d.text((110, 362 + i * 48), k, font=font(24), fill=MUTED)
        d.text((330, 358 + i * 48), v, font=font(28, True), fill=INK)
    d.text((760, 362), "Date of service", font=font(24), fill=MUTED)
    d.text((960, 358), "09/15/2026", font=font(28, True), fill=INK)
    d.text((760, 410), "Place of service", font=font(24), fill=MUTED)
    d.text((960, 406), "11 - Office", font=font(28, True), fill=INK)

    d.text((80, 600), "Reason for visit: right knee pain after a fall; MRI ordered to evaluate the meniscus.", font=font(26), fill=INK)

    y = 690
    heads = [(80, "DATE"), (260, "CPT"), (400, "DESCRIPTION"), (860, "DX (ICD-10)"), (1000, "UNITS")]
    d.line([80, y, W - 80, y], fill=INK, width=3)
    for x, t in heads:
        d.text((x, y + 14), t, font=font(22, True), fill=MUTED)
    right(d, W - 80, y + 14, "CHARGE", font(22, True), MUTED)
    d.line([80, y + 56, W - 80, y + 56], fill=RULE, width=2)

    lines = [
        ("09/15/2026", "99214", "Office visit, established patient,", "moderate complexity", "M25.561", 1, 245.00),
        ("09/15/2026", "73721", "MRI right knee joint,", "without contrast", "S83.241A", 1, 1650.00),
    ]
    y += 76
    for date, cpt, d1, d2, dx, units, charge in lines:
        d.text((80, y), date, font=font(26), fill=INK)
        d.text((260, y), cpt, font=font(26, True), fill=INK)
        d.text((400, y), d1, font=font(26), fill=INK)
        d.text((400, y + 34), d2, font=font(24), fill=MUTED)
        d.text((860, y), dx, font=font(26), fill=INK)
        d.text((1020, y), str(units), font=font(26), fill=INK)
        right(d, W - 80, y, money(charge), font(26, True))
        d.line([80, y + 84, W - 80, y + 84], fill=RULE, width=1)
        y += 104

    total = sum(l[-1] for l in lines)
    y += 20
    for label, val, bold in (("Total charges", total, True), ("Payments / adjustments", 0.0, False), ("Balance due", total, True)):
        d.text((700, y), label, font=font(28, bold), fill=INK)
        right(d, W - 80, y, money(val), font(28, bold))
        y += 52

    d.text((80, y + 50), "Diagnoses: M25.561 Pain in right knee;  S83.241A Tear of medial meniscus, right knee.", font=font(24), fill=MUTED)
    footer(d)
    return img


def repair_estimate() -> Image.Image:
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 190], fill=(120, 53, 15))
    d.text((80, 50), "PRECISION AUTO BODY", font=font(50, True), fill="white")
    d.text((80, 118), "2210 Research Blvd, Austin, TX 78758  |  (512) 555-0188", font=font(24), fill=(253, 230, 200))
    d.text((80, 150), "Collision repair estimate  |  Shop license #R-44721", font=font(24), fill=(253, 230, 200))

    d.text((80, 240), "REPAIR ESTIMATE", font=font(40, True), fill=INK)
    right(d, W - 80, 236, "Estimate date: 09/28/2026", font(26))
    right(d, W - 80, 274, "Estimate #: PAB-55102", font(26))

    d.rectangle([80, 340, W - 80, 600], fill=TINT)
    left = [("Customer", "Maria Lopez"), ("Vehicle", "2022 Toyota RAV4"), ("VIN", "2T3P1RFV8NW123456"), ("Insurer / policy", "POL-100245")]
    for i, (k, v) in enumerate(left):
        d.text((110, 362 + i * 48), k, font=font(24), fill=MUTED)
        d.text((340, 358 + i * 48), v, font=font(28, True), fill=INK)
    d.text((780, 362), "Date of loss", font=font(24), fill=MUTED)
    d.text((960, 358), "09/26/2026", font=font(28, True), fill=INK)
    d.text((780, 410), "Drivable", font=font(24), fill=MUTED)
    d.text((960, 406), "Yes", font=font(28, True), fill=INK)

    d.text((80, 640), "Damage: rear bumper cover and absorber, right tail lamp, wiring harness. Rear impact.", font=font(26), fill=INK)

    parts = [("Rear bumper cover (OEM)", 685.00), ("Rear bumper absorber", 164.00), ("Tail lamp assembly, right", 412.50), ("Tail lamp wiring harness", 96.50), ("Bumper reinforcement", 238.00)]
    labor = [("Body labor, 14.0 h @ $68.00", 952.00), ("Refinish labor, 6.5 h @ $68.00", 442.00), ("Frame / measure, 4.0 h @ $68.00", 272.00)]
    tax = round(sum(p for _, p in parts) * 0.0825, 2)
    target_total = 3840.17
    materials = round(target_total - sum(p for _, p in parts) - sum(l for _, l in labor) - tax, 2)

    y = 720
    d.line([80, y, W - 80, y], fill=INK, width=3)
    d.text((80, y + 14), "ITEM", font=font(22, True), fill=MUTED)
    right(d, W - 80, y + 14, "AMOUNT", font(22, True), MUTED)
    y += 66
    for title, items in (("PARTS", parts), ("LABOR", labor)):
        d.text((80, y), title, font=font(22, True), fill=MUTED)
        y += 38
        for name, amt in items:
            d.text((110, y), name, font=font(26), fill=INK)
            right(d, W - 80, y, money(amt), font(26))
            y += 44
        y += 12
    for name, amt in (("Paint & materials", materials), ("Sales tax on parts (8.25%)", tax)):
        d.text((110, y), name, font=font(26), fill=INK)
        right(d, W - 80, y, money(amt), font(26))
        y += 44
    d.line([80, y + 6, W - 80, y + 6], fill=INK, width=3)
    d.text((110, y + 24), "TOTAL ESTIMATE", font=font(32, True), fill=INK)
    right(d, W - 80, y + 24, money(target_total), font(32, True))
    d.text((80, y + 100), "Estimate valid for 30 days. Hidden damage found during teardown may change the final cost.", font=font(24), fill=MUTED)
    footer(d)
    return img


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    itemized_bill().save(OUT / "sample-itemized-bill.pdf", resolution=150)
    repair_estimate().save(OUT / "sample-repair-estimate.png")
    print("Wrote", [p.name for p in OUT.iterdir()])
