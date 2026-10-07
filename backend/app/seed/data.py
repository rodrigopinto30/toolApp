"""Initial store data. Labels are {"es": ..., "en": ...}; prices are in USD."""

from decimal import Decimal
from typing import Any

INITIAL_EXCHANGE_RATE = Decimal("1450.000000")  # ARS per 1 USD (the admin updates it)

# code -> name, cost_usd, free_over_usd, eta_min_days, eta_max_days
SHIPPING_ZONES: dict[str, tuple[dict[str, str], str, str, int, int]] = {
    "amba": ({"es": "AMBA", "en": "AMBA"}, "8.00", "150.00", 1, 3),
    "center": ({"es": "Centro", "en": "Center"}, "12.00", "200.00", 3, 5),
    "north": ({"es": "Norte", "en": "North"}, "15.00", "250.00", 4, 7),
    "patagonia": ({"es": "Patagonia", "en": "Patagonia"}, "18.00", "300.00", 5, 9),
}

# ISO 3166-2:AR code -> name, shipping zone code
PROVINCES: dict[str, tuple[str, str]] = {
    "AR-C": ("Ciudad Autónoma de Buenos Aires", "amba"),
    "AR-B": ("Buenos Aires", "amba"),
    "AR-K": ("Catamarca", "north"),
    "AR-H": ("Chaco", "north"),
    "AR-U": ("Chubut", "patagonia"),
    "AR-X": ("Córdoba", "center"),
    "AR-W": ("Corrientes", "north"),
    "AR-E": ("Entre Ríos", "center"),
    "AR-P": ("Formosa", "north"),
    "AR-Y": ("Jujuy", "north"),
    "AR-L": ("La Pampa", "center"),
    "AR-F": ("La Rioja", "north"),
    "AR-M": ("Mendoza", "center"),
    "AR-N": ("Misiones", "north"),
    "AR-Q": ("Neuquén", "patagonia"),
    "AR-R": ("Río Negro", "patagonia"),
    "AR-A": ("Salta", "north"),
    "AR-J": ("San Juan", "center"),
    "AR-D": ("San Luis", "center"),
    "AR-Z": ("Santa Cruz", "patagonia"),
    "AR-S": ("Santa Fe", "center"),
    "AR-G": ("Santiago del Estero", "north"),
    "AR-V": ("Tierra del Fuego", "patagonia"),
    "AR-T": ("Tucumán", "north"),
}

PICKUP_POINTS: list[dict[str, Any]] = [
    {
        "name": "ToolApp Store",
        "address": "Av. Corrientes 1234, C1043 CABA",
        "hours": {"mon_fri": "09:00-18:00", "sat": "09:00-13:00"},
    },
]

# slug -> name, children (slug -> name)
CATEGORIES: dict[str, tuple[dict[str, str], dict[str, dict[str, str]]]] = {
    "power-tools": (
        {"es": "Herramientas eléctricas", "en": "Power tools"},
        {
            "drills": {"es": "Taladros", "en": "Drills"},
            "angle-grinders": {"es": "Amoladoras", "en": "Angle grinders"},
            "saws": {"es": "Sierras", "en": "Saws"},
        },
    ),
    "hand-tools": (
        {"es": "Herramientas manuales", "en": "Hand tools"},
        {
            "screwdrivers": {"es": "Destornilladores", "en": "Screwdrivers"},
            "wrenches": {"es": "Llaves", "en": "Wrenches"},
            "hammers": {"es": "Martillos", "en": "Hammers"},
        },
    ),
    "measuring": ({"es": "Medición", "en": "Measuring"}, {}),
    "safety": ({"es": "Seguridad y EPP", "en": "Safety & PPE"}, {}),
    "garden": ({"es": "Jardín", "en": "Garden"}, {}),
    "fasteners": ({"es": "Fijaciones", "en": "Fasteners"}, {}),
}

BRANDS: dict[str, str] = {
    "bosch": "Bosch",
    "makita": "Makita",
    "dewalt": "DeWalt",
    "stanley": "Stanley",
    "black-decker": "Black+Decker",
    "bahco": "Bahco",
    "truper": "Truper",
    "3m": "3M",
}


def _same(label: str) -> dict[str, str]:
    return {"es": label, "en": label}


# code -> name, values (slug -> label)
ATTRIBUTES: dict[str, tuple[dict[str, str], dict[str, dict[str, str]]]] = {
    "voltage": (
        {"es": "Voltaje", "en": "Voltage"},
        {slug: _same(slug.upper()) for slug in ("12v", "18v", "20v")},
    ),
    "power": (
        {"es": "Potencia", "en": "Power"},
        {slug: _same(slug.upper()) for slug in ("600w", "750w", "900w", "1200w")},
    ),
    "size": (
        {"es": "Medida", "en": "Size"},
        {
            "6mm": _same("6 mm"),
            "8mm": _same("8 mm"),
            "10mm": _same("10 mm"),
            "150mm": _same("150 mm"),
            "200mm": _same("200 mm"),
            "250mm": _same("250 mm"),
            "5m": _same("5 m"),
            "8m": _same("8 m"),
        },
    ),
    "clothing_size": (
        {"es": "Talle", "en": "Clothing size"},
        {slug: _same(slug.upper()) for slug in ("s", "m", "l", "xl")},
    ),
    "color": (
        {"es": "Color", "en": "Color"},
        {
            "clear": {"es": "Transparente", "en": "Clear"},
            "grey": {"es": "Gris", "en": "Grey"},
            "yellow": {"es": "Amarillo", "en": "Yellow"},
        },
    ),
}

# Warranty text per locale: (description sentence, spec label, spec value).
WARRANTY_TEXT: dict[str, tuple[str, str, str]] = {
    "es": ("Garantía oficial de {months} meses.", "Garantía", "{months} meses"),
    "en": ("Official {months}-month warranty.", "Warranty", "{months} months"),
}

# Each variant: (sku, price_usd, compare_at_price_usd | None, stock, {attribute_code: value_slug})
Variant = tuple[str, str, str | None, int, dict[str, str]]

PRODUCTS: list[dict[str, Any]] = [
    {
        "slug": "bosch-cordless-hammer-drill-18v",
        "brand": "bosch",
        "category": "drills",
        "featured": True,
        "name": {"es": "Taladro percutor inalámbrico 18V", "en": "18V cordless hammer drill"},
        "short": {
            "es": "Taladro percutor compacto con batería de litio y mandril de 13 mm.",
            "en": "Compact hammer drill with lithium battery and 13 mm chuck.",
        },
        "variants": [("BOS-HD18-18V", "189.00", "219.00", 15, {"voltage": "18v"})],
    },
    {
        "slug": "makita-hammer-drill",
        "brand": "makita",
        "category": "drills",
        "featured": False,
        "name": {"es": "Taladro percutor 13 mm", "en": "13 mm hammer drill"},
        "short": {
            "es": "Taladro percutor con cable para mampostería, madera y metal.",
            "en": "Corded hammer drill for masonry, wood and metal.",
        },
        "variants": [
            ("MAK-HD13-600W", "79.90", None, 20, {"power": "600w"}),
            ("MAK-HD13-750W", "94.90", None, 12, {"power": "750w"}),
        ],
    },
    {
        "slug": "dewalt-drill-driver-20v",
        "brand": "dewalt",
        "category": "drills",
        "featured": True,
        "name": {"es": "Taladro atornillador inalámbrico 20V", "en": "20V cordless drill driver"},
        "short": {
            "es": "Atornillador de dos velocidades con luz LED y embrague de 15 posiciones.",
            "en": "Two-speed drill driver with LED light and 15-position clutch.",
        },
        "variants": [("DEW-DD20-20V", "159.00", None, 12, {"voltage": "20v"})],
    },
    {
        "slug": "black-decker-drill-driver-12v",
        "brand": "black-decker",
        "category": "drills",
        "featured": False,
        "name": {"es": "Taladro atornillador 12V", "en": "12V drill driver"},
        "short": {
            "es": "Liviano y práctico para trabajos de hogar.",
            "en": "Light and handy for home jobs.",
        },
        "variants": [("BLD-DD12-12V", "59.90", "69.90", 30, {"voltage": "12v"})],
    },
    {
        "slug": "bosch-angle-grinder-115",
        "brand": "bosch",
        "category": "angle-grinders",
        "featured": True,
        "name": {"es": "Amoladora angular 115 mm", "en": "115 mm angle grinder"},
        "short": {
            "es": "Amoladora para corte y desbaste con protección ajustable.",
            "en": "Grinder for cutting and grinding with adjustable guard.",
        },
        "variants": [
            ("BOS-AG115-750W", "89.00", None, 25, {"power": "750w"}),
            ("BOS-AG115-900W", "109.00", None, 10, {"power": "900w"}),
        ],
    },
    {
        "slug": "makita-cordless-angle-grinder-18v",
        "brand": "makita",
        "category": "angle-grinders",
        "featured": False,
        "name": {"es": "Amoladora angular inalámbrica 18V", "en": "18V cordless angle grinder"},
        "short": {
            "es": "Libertad sin cables para cortes en obra.",
            "en": "Cord-free freedom for cuts on site.",
        },
        "variants": [("MAK-AG18-18V", "139.00", None, 8, {"voltage": "18v"})],
    },
    {
        "slug": "dewalt-circular-saw-184",
        "brand": "dewalt",
        "category": "saws",
        "featured": False,
        "name": {"es": "Sierra circular 184 mm", "en": "184 mm circular saw"},
        "short": {
            "es": "Sierra circular con guía paralela y ajuste de profundidad.",
            "en": "Circular saw with rip fence and depth adjustment.",
        },
        "variants": [("DEW-CS184-1200W", "129.00", None, 9, {"power": "1200w"})],
    },
    {
        "slug": "bosch-jigsaw",
        "brand": "bosch",
        "category": "saws",
        "featured": False,
        "name": {"es": "Sierra caladora", "en": "Jigsaw"},
        "short": {
            "es": "Cortes curvos y rectos en madera, plástico y metal.",
            "en": "Curved and straight cuts in wood, plastic and metal.",
        },
        "variants": [("BOS-JS-600W", "99.00", None, 14, {"power": "600w"})],
    },
    {
        "slug": "stanley-screwdriver-set-6",
        "brand": "stanley",
        "category": "screwdrivers",
        "featured": True,
        "name": {"es": "Juego de destornilladores 6 piezas", "en": "6-piece screwdriver set"},
        "short": {
            "es": "Puntas planas y Phillips con mango ergonómico.",
            "en": "Flat and Phillips tips with ergonomic handle.",
        },
        "variants": [("STA-SD6", "19.90", None, 50, {})],
    },
    {
        "slug": "bahco-precision-screwdrivers",
        "brand": "bahco",
        "category": "screwdrivers",
        "featured": False,
        "name": {"es": "Destornilladores de precisión", "en": "Precision screwdrivers"},
        "short": {
            "es": "Set para electrónica y mecanismos pequeños.",
            "en": "Set for electronics and small mechanisms.",
        },
        "variants": [("BAH-PSD", "24.50", None, 35, {})],
    },
    {
        "slug": "stanley-adjustable-wrench",
        "brand": "stanley",
        "category": "wrenches",
        "featured": False,
        "name": {"es": "Llave ajustable", "en": "Adjustable wrench"},
        "short": {
            "es": "Acero al cromo vanadio con escala grabada.",
            "en": "Chrome vanadium steel with engraved scale.",
        },
        "variants": [
            ("STA-AW-150", "9.90", None, 40, {"size": "150mm"}),
            ("STA-AW-200", "12.90", None, 35, {"size": "200mm"}),
            ("STA-AW-250", "16.90", None, 20, {"size": "250mm"}),
        ],
    },
    {
        "slug": "bahco-combination-wrench-set-8",
        "brand": "bahco",
        "category": "wrenches",
        "featured": False,
        "name": {"es": "Juego de llaves combinadas 8 piezas", "en": "8-piece combination wrench set"},
        "short": {
            "es": "Llaves de 8 a 19 mm con estuche.",
            "en": "8 to 19 mm wrenches with case.",
        },
        "variants": [("BAH-CW8", "54.00", "64.00", 15, {})],
    },
    {
        "slug": "truper-claw-hammer-16oz",
        "brand": "truper",
        "category": "hammers",
        "featured": False,
        "name": {"es": "Martillo de uña 16 oz", "en": "16 oz claw hammer"},
        "short": {
            "es": "Cabeza forjada y mango de madera.",
            "en": "Forged head and wooden handle.",
        },
        "variants": [("TRU-CH16", "11.50", None, 60, {})],
    },
    {
        "slug": "stanley-fiberglass-hammer",
        "brand": "stanley",
        "category": "hammers",
        "featured": False,
        "name": {"es": "Martillo con mango de fibra", "en": "Fiberglass handle hammer"},
        "short": {
            "es": "Mango de fibra de vidrio que absorbe vibraciones.",
            "en": "Fiberglass handle that absorbs vibration.",
        },
        "variants": [("STA-FH", "15.90", None, 40, {})],
    },
    {
        "slug": "stanley-tape-measure",
        "brand": "stanley",
        "category": "measuring",
        "featured": True,
        "name": {"es": "Cinta métrica", "en": "Tape measure"},
        "short": {
            "es": "Cinta con traba y carcasa resistente a golpes.",
            "en": "Locking tape with impact-resistant case.",
        },
        "variants": [
            ("STA-TM-5M", "7.90", None, 80, {"size": "5m"}),
            ("STA-TM-8M", "10.90", None, 50, {"size": "8m"}),
        ],
    },
    {
        "slug": "bosch-laser-distance-meter-40m",
        "brand": "bosch",
        "category": "measuring",
        "featured": False,
        "name": {"es": "Medidor láser de distancia 40 m", "en": "40 m laser distance meter"},
        "short": {
            "es": "Mide distancias, áreas y volúmenes con precisión milimétrica.",
            "en": "Measures distances, areas and volumes with millimeter precision.",
        },
        "variants": [("BOS-LDM40", "69.00", None, 10, {})],
    },
    {
        "slug": "3m-safety-glasses",
        "brand": "3m",
        "category": "safety",
        "featured": False,
        "name": {"es": "Anteojos de seguridad", "en": "Safety glasses"},
        "short": {
            "es": "Lentes de policarbonato con protección UV.",
            "en": "Polycarbonate lenses with UV protection.",
        },
        "variants": [
            ("3M-SG-CLEAR", "4.90", None, 150, {"color": "clear"}),
            ("3M-SG-GREY", "5.40", None, 90, {"color": "grey"}),
        ],
    },
    {
        "slug": "truper-leather-work-gloves",
        "brand": "truper",
        "category": "safety",
        "featured": False,
        "name": {"es": "Guantes de trabajo de cuero", "en": "Leather work gloves"},
        "short": {
            "es": "Guantes reforzados para trabajos pesados.",
            "en": "Reinforced gloves for heavy-duty work.",
        },
        "variants": [
            ("TRU-WG-S", "6.50", None, 40, {"clothing_size": "s"}),
            ("TRU-WG-M", "6.50", None, 60, {"clothing_size": "m"}),
            ("TRU-WG-L", "6.50", None, 60, {"clothing_size": "l"}),
            ("TRU-WG-XL", "6.50", None, 30, {"clothing_size": "xl"}),
        ],
    },
    {
        "slug": "truper-pruning-shears",
        "brand": "truper",
        "category": "garden",
        "featured": False,
        "name": {"es": "Tijera de podar", "en": "Pruning shears"},
        "short": {
            "es": "Hojas de acero templado con traba de seguridad.",
            "en": "Hardened steel blades with safety lock.",
        },
        "variants": [("TRU-PS", "13.90", None, 45, {})],
    },
    {
        "slug": "black-decker-hedge-trimmer",
        "brand": "black-decker",
        "category": "garden",
        "featured": False,
        "name": {"es": "Cortacercos eléctrico", "en": "Electric hedge trimmer"},
        "short": {
            "es": "Cuchilla de doble acción para cercos y arbustos.",
            "en": "Dual-action blade for hedges and shrubs.",
        },
        "variants": [("BLD-HT-600W", "74.90", None, 7, {"power": "600w"})],
    },
    {
        "slug": "truper-nylon-wall-plugs-100",
        "brand": "truper",
        "category": "fasteners",
        "featured": False,
        "name": {"es": "Tarugos de nylon (100 u.)", "en": "Nylon wall plugs (100 pcs)"},
        "short": {
            "es": "Para fijaciones en ladrillo y hormigón.",
            "en": "For fixings in brick and concrete.",
        },
        "variants": [
            ("TRU-WP-6", "3.50", None, 200, {"size": "6mm"}),
            ("TRU-WP-8", "4.50", None, 150, {"size": "8mm"}),
            ("TRU-WP-10", "5.90", None, 100, {"size": "10mm"}),
        ],
    },
]
