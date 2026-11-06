# Mapa Interactivo de Escuelas Secundarias Técnicas de Veracruz

Aplicación web interactiva para visualizar la distribución geográfica de las escuelas secundarias técnicas del estado de Veracruz, México. El mapa permite identificar los planteles, consultar su información, distinguir sus modalidades educativas y visualizar las áreas de influencia correspondientes a las delegaciones regionales.

## Características principales

- **Visualización geográfica:** representación del estado de Veracruz y sus límites municipales.
- **Ubicación de escuelas:** visualización de los planteles mediante marcadores geográficos.
- **Identificación por número:** cada marcador muestra el número de la escuela, cuando está disponible en su nombre.
- **Agrupación de marcadores:** las escuelas cercanas se agrupan automáticamente para facilitar la navegación.
- **Clasificación por modalidad:** los marcadores utilizan colores para distinguir las modalidades:
  - 🔴 Industrial
  - 🟢 Agropecuaria
  - 🔵 Pesquera
- **Delegaciones regionales:** representación de las 13 delegaciones mediante áreas de influencia generadas con diagramas de Voronoi.
- **Consulta de información:** al seleccionar una escuela se muestra su información, incluyendo nombre, CCT, modalidad, delegación regional, municipio, localidad y domicilio.
- **Límites municipales:** visualización de las divisiones territoriales de los municipios.
- **Navegación restringida:** el mapa ajusta su vista al territorio de Veracruz y establece límites de desplazamiento y niveles de zoom.

## Tecnologías utilizadas

| Tecnología | Uso |
|---|---|
| React | Construcción de la interfaz |
| Vite | Herramienta de desarrollo y compilación |
| TypeScript | Tipado estático |
| React Leaflet | Integración de mapas interactivos |
| Leaflet | Motor de visualización cartográfica |
| Turf.js | Operaciones y generación de geometrías geográficas |
| React Leaflet Cluster | Agrupación de marcadores |
| CARTO | Proveedor de mapas base |
| GeoJSON | Representación de información geográfica |
| JSON | Almacenamiento de información de escuelas y regiones |

### Librerías geográficas

- `@turf/helpers`: creación y manipulación de elementos geográficos.
- `@turf/voronoi`: generación de diagramas de Voronoi.
- `@turf/difference`: operaciones geométricas para generar la máscara territorial.
- `leaflet.markercluster`: agrupación de marcadores.

## Estructura del proyecto

La estructura relevante para los datos y el componente cartográfico es:

```text
public/
└── data/
    ├── veracruz.geojson
    ├── municipios-veracruz.geojson
    ├── escuelas-veracruz.json
    └── regiones-veracruz.json

src/
└── components/
    └── map/
        └── MapView.tsx
```

Los archivos geográficos y los catálogos se almacenan en `public/data/` y se cargan mediante solicitudes HTTP al iniciar el mapa.

## Datos del proyecto

El sistema utiliza información de escuelas, delegaciones regionales y geometrías territoriales.

### Escuelas

El archivo `escuelas-veracruz.json` contiene el catálogo de planteles. Cada escuela contempla los siguientes campos:

| Campo | Descripción |
|---|---|
| `id` | Identificador del registro |
| `cct` | Clave de Centro de Trabajo |
| `nombre` | Nombre del plantel |
| `modalidad` | Modalidad educativa |
| `municipio` | Municipio donde se encuentra |
| `localidad` | Localidad del plantel |
| `domicilio` | Domicilio registrado |
| `latitud` | Coordenada geográfica |
| `longitud` | Coordenada geográfica |
| `regionId` | Identificador de la delegación regional |

Las modalidades contempladas son `industrial`, `agropecuaria` y `pesquera`.

### Delegaciones regionales

El archivo `regiones-veracruz.json` contiene el catálogo de las 13 delegaciones regionales.

Cada región cuenta con un identificador y un nombre. El identificador permite relacionar los planteles con su respectiva delegación y asignar el color correspondiente en el mapa.

### Información geográfica

| Archivo | Contenido |
|---|---|
| `veracruz.geojson` | Geometría territorial del estado de Veracruz |
| `municipios-veracruz.geojson` | Límites geográficos de los municipios |

## Diagrama de Voronoi

El mapa utiliza diagramas de Voronoi para representar las áreas de influencia de las delegaciones regionales.

El procedimiento consiste en:

1. Obtener las coordenadas geográficas de las escuelas.
2. Generar puntos geográficos utilizando Turf.js.
3. Calcular las celdas de Voronoi a partir de los puntos disponibles.
4. Asociar cada celda con la delegación regional de la escuela correspondiente.
5. Asignar un color a cada región para facilitar su identificación.
6. Representar las celdas sobre el mapa base.

La representación utiliza una transparencia que permite conservar la referencia visual del mapa y de los límites municipales.

## Configuración del proyecto

### Requisitos previos

- Node.js.
- npm.
- Una clave de API de CARTO.

### 1. Clonar el repositorio

```bash
git clone URL_DEL_REPOSITORIO
```

Ingresar al directorio:

```bash
cd NOMBRE_DEL_REPOSITORIO
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar la API de CARTO

El proyecto utiliza los mapas base de CARTO. Para configurar el acceso, crea un archivo `.env.local` en la raíz del proyecto:

```env
VITE_CARTO_API_KEY=TU_API_KEY
```

Sustituye `TU_API_KEY` por la clave correspondiente.

**Importante:** las variables de entorno que comienzan con `VITE_` se incorporan al código del lado del cliente. Por lo tanto, no deben considerarse secretos. Configura las restricciones y permisos de la clave desde CARTO.

### 4. Ejecutar en desarrollo

```bash
npm run dev
```

Vite mostrará la dirección local para acceder a la aplicación, normalmente:

```text
http://localhost:5173
```

### 5. Generar la versión de producción

```bash
npm run build
```

Los archivos compilados se generan en el directorio `dist/`.

Para visualizar la compilación localmente:

```bash
npm run preview
```

## Consideraciones

- Los archivos JSON y GeoJSON deben conservarse dentro de `public/data/`, respetando sus nombres y rutas.
- Las escuelas deben contar con coordenadas geográficas válidas para aparecer en el mapa.
- El campo `regionId` debe coincidir con el identificador de alguna de las 13 delegaciones regionales.
- Los colores de las regiones y modalidades se encuentran definidos en el componente `MapView.tsx`.
- La clave de CARTO debe configurarse mediante la variable de entorno `VITE_CARTO_API_KEY`.
- Si se modifica la estructura de los archivos de datos, también deberán actualizarse las interfaces y la lógica de carga correspondiente