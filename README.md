# Claude Adorno · Hub

Landing centralizada de aplicaciones para Claudia Adorno SRL.

## Módulos vigentes

- **CRM** — https://claudiaadornosrl-prog.github.io/crm-adorno/
- **RRHH** — https://claudiaadornosrl-prog.github.io/rrhh-adorno/

## Stack

- Single-page HTML estático
- Fuentes desde Google Fonts (Spectral · Forum · Inter)
- Iconos desde Tabler Icons (CDN)
- Hosteado en GitHub Pages

## Estructura

```
hub/
├── index.html             # Landing
├── favicon.svg            # Asterisco coral (réplica del logo de Claude)
├── manifest.webmanifest   # PWA básica
├── deploy.ps1             # Script de deploy (git add + commit + push)
└── README.md
```

## Deploy

```powershell
.\deploy.ps1
```

GitHub Pages publica automáticamente la rama `main`. URL: https://claudiaadornosrl-prog.github.io/hub/

## Agregar un módulo nuevo

Editar `index.html`, sección `.grid`. Patrón:

```html
<a class="card card-NOMBRE" href="https://...">
    <i class="ti ti-ICONO icon"></i>
    <i class="ti ti-arrow-right arrow"></i>
    <div class="title">Nombre del módulo</div>
    <div class="desc">Subtítulo corto</div>
</a>
```

Y agregar el color del módulo en `:root`:

```css
--NOMBRE: #COLOR;
--NOMBRE-soft: #COLOR-CLARITO;
```

Más la clase `.card-NOMBRE` con el `--card-bg`.
