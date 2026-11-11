# Íconos de los módulos en pastilla (11-nov-2026, JP): color de su moneda en el Hub + su ícono Tabler en crema.
# Para un módulo nuevo: sumarlo a MODULOS (color = su moneda del Hub, código = el de su ícono en tabler-icons.min.css)
# Uso: python iconos_modulos.py <carpeta_salida>   → <salida>/<modulo>/icon-{192,512}-pastilla.png, icon-512-mascara.png
#                                                    y <salida>/preview.png
import os, sys
from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
FUENTE = os.path.join(AQUI, 'tabler-icons.ttf')   # se baja sola la primera vez (no va al repo)
if not os.path.exists(FUENTE):
    import urllib.request
    urllib.request.urlretrieve('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/fonts/tabler-icons.ttf', FUENTE)
CREMA = (247, 243, 236)
MODULOS = [  # carpeta, nombre, color (hex de la moneda del Hub), código Tabler (None = caja fuerte dibujada)
    ('crm-adorno', 'Clientes', '6E7D5A', 'f5f8'),
    ('rrhh-adorno', 'Colaboradores', '7A6274', 'ebf2'),
    ('ventas-adorno', 'Ventas', 'A65A42', 'eb84'),
    ('tesoreria-adorno', 'Tesorería', 'A07F45', None),
    ('stock-adorno', 'Stock', '4F6B68', 'eaff'),
    ('documentos-adorno', 'Documentos', '5D7080', 'f918'),
    ('compras-adorno', 'Compras', 'B07A55', 'eb25'),
    ('gastos-adorno', 'Gastos', '7C7650', 'eb96'),
    ('impuestos-adorno', 'Impuestos', '6B4C3B', 'ebe2'),
    ('productos-adorno', 'Productos', '59698A', 'ef86'),
    ('marketing-adorno', 'Marketing', 'A3656F', 'ed61'),
    ('obra-adorno', 'Obra', '8A7B70', 'ef91'),
    ('pos-adorno', 'POS', '3D7C88', 'edfd'),
]

def rgb(h): return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
def oscuro(c, f=0.72): return tuple(int(x * f) for x in c)

def dibujar_caja(d, cx, cy, t, w):
    # caja fuerte como la del Hub: cuerpo redondeado, rueda con 4 marcas y dos patitas
    x0, y0, x1, y1 = cx - t * 0.42, cy - t * 0.40, cx + t * 0.42, cy + t * 0.30
    d.rounded_rectangle((x0, y0, x1, y1), radius=t * 0.09, outline=CREMA, width=w)
    r = t * 0.14; cyr = cy - t * 0.05
    d.ellipse((cx - r, cyr - r, cx + r, cyr + r), outline=CREMA, width=w)
    for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        a = r + t * 0.03; b = r + t * 0.10
        d.line((cx + dx * a, cyr + dy * a, cx + dx * b, cyr + dy * b), fill=CREMA, width=w)
    for sx in (-1, 1):
        x = cx + sx * t * 0.30
        d.line((x, y1, x, y1 + t * 0.10), fill=CREMA, width=w)

def icono(d, cod, cx, cy, tam):
    if cod is None:
        dibujar_caja(d, cx, cy, tam, max(2, int(tam * 0.075)))
        return
    f = ImageFont.truetype(FUENTE, int(tam))
    g = chr(int(cod, 16))
    b = d.textbbox((0, 0), g, font=f)
    d.text((cx - (b[0] + b[2]) / 2, cy - (b[1] + b[3]) / 2), g, font=f, fill=CREMA)

def pastilla(color, cod, tam):
    S = 2048; c = rgb(color)
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    m = int(S * 0.02); h = int(S * 0.62); y0 = (S - h) // 2; r = h // 2
    d.rounded_rectangle((m, y0, S - m, y0 + h), radius=r, fill=c, outline=oscuro(c), width=int(S * 0.014))
    icono(d, cod, S / 2, S / 2, S * 0.36)
    return im.resize((tam, tam), Image.LANCZOS)

def vivo(color, sat=1.35, luz=0.02):
    # (11-nov, JP: "con el color que resalta un poquito más que en el Hub") mismo tono de la moneda, más saturado
    import colorsys
    r, g, b = [x / 255 for x in rgb(color)]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    r, g, b = colorsys.hls_to_rgb(h, min(0.62, l + luz), min(0.85, s * sat))
    return '%02X%02X%02X' % (round(r * 255), round(g * 255), round(b * 255))

def moneda(color, cod, tam):
    # (11-nov, JP: "las pastillas se ven muy chicas en la barra: redondos, el ícono más grande y el fondo con el color del
    #  módulo, como las monedas del Hub") círculo casi del tamaño del ícono, canto más oscuro y el ícono en crema
    S = 2048; c = rgb(vivo(color))
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    m = int(S * 0.03); k = int(S * 0.035)            # k: cuánto se ve el canto abajo
    cara = (m, m, S - m, S - m - k)
    d.ellipse((m, m + k, S - m, S - m), fill=oscuro(c, 0.62))   # canto
    d.ellipse(cara, fill=c)                                      # cara
    # brillo suave arriba, como la cara de la moneda
    brillo = Image.new('RGBA', (S, S), (0, 0, 0, 0)); db = ImageDraw.Draw(brillo)
    db.ellipse((int(S * 0.12), int(S * 0.07), int(S * 0.88), int(S * 0.55)), fill=(255, 255, 255, 26))
    mascara_c = Image.new('L', (S, S), 0); ImageDraw.Draw(mascara_c).ellipse(cara, fill=255)
    im.paste(Image.alpha_composite(im, brillo), (0, 0), mascara_c)
    d = ImageDraw.Draw(im)
    icono(d, cod, S / 2, S / 2 - S * 0.015, S * 0.56)
    return im.resize((tam, tam), Image.LANCZOS)

def mascara(color, cod, tam):  # cuadrado lleno para los Android que recortan el ícono a su forma
    S = 2048; c = rgb(vivo(color))
    im = Image.new('RGBA', (S, S), c + (255,)); d = ImageDraw.Draw(im)
    icono(d, cod, S / 2, S / 2, S * 0.40)
    return im.resize((tam, tam), Image.LANCZOS)

if __name__ == '__main__':
    salida = sys.argv[1]
    # (11-nov) de pastilla a moneda: archivos icon-{192,512}-moneda.png ("any") + icon-512-mascara.png ("maskable")
    for carpeta, nombre, color, cod in MODULOS:
        dst = os.path.join(salida, carpeta); os.makedirs(dst, exist_ok=True)
        for t in (192, 512):
            moneda(color, cod, t).save(os.path.join(dst, f'icon-{t}-moneda.png'), optimize=True)
        mascara(color, cod, 512).save(os.path.join(dst, 'icon-512-mascara.png'), optimize=True)
    # vista previa: arriba como en la barra de Windows (24 y 32 px, sobre barra oscura y clara), abajo grandes
    W, H = 13 * 120 + 40, 470
    prev = Image.new('RGB', (W, H), (32, 32, 32)); d = ImageDraw.Draw(prev)
    d.rectangle((0, 70, W, 140), fill=(238, 238, 238)); d.rectangle((0, 300, W, H), fill=(243, 240, 234))
    try: txt = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 14)
    except Exception: txt = ImageFont.load_default()
    for i, (carpeta, nombre, color, cod) in enumerate(MODULOS):
        x = 20 + i * 120
        for tam, y in ((24, 22), (32, 88)):
            ic = moneda(color, cod, tam); prev.paste(ic, (x + 60 - tam // 2, y), ic)
        for tam, y in ((96, 160), (96, 320)):
            ic = moneda(color, cod, tam); prev.paste(ic, (x + 12, y), ic)
        for y, col in ((262, (230, 230, 230)), (424, (40, 36, 32))):
            b = d.textbbox((0, 0), nombre, font=txt)
            d.text((x + 60 - (b[2] - b[0]) / 2, y), nombre, font=txt, fill=col)
    prev.save(os.path.join(salida, 'preview.png'))
    print('ok')
