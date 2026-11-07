import { useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Popup,
  useMap,
  Marker,
} from "react-leaflet";
import L from "leaflet";
import type {
  Feature,
  FeatureCollection,
  Polygon,
  MultiPolygon,
} from "geojson";
import difference from "@turf/difference";
import voronoi from "@turf/voronoi";
import { featureCollection, polygon, point } from "@turf/helpers";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet.markercluster";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";

type VeracruzFeature = Feature<Polygon | MultiPolygon>;

export interface Escuela {
  id: string;
  cct: string;
  nombre: string;
  modalidad: "industrial" | "agropecuaria" | "pesquera";
  municipio: string;
  localidad: string;
  domicilio: string;
  latitud: number;
  longitud: number;
  regionId: string;
}

export interface Region {
  id: string;
  nombre: string;
}


export interface DatosBusqueda {
  escuelas: Escuela[];
  municipios: string[];
  regiones: Region[];
}

export type SeleccionMapa =
  | { tipo: "escuela"; escuela: Escuela }
  | { tipo: "municipio"; nombre: string }
  | { tipo: "region"; regionId: string };

interface MapViewProps {
  seleccion: SeleccionMapa | null;
  onDatosCargados: (datos: DatosBusqueda) => void;
}

function normalizarTexto(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim();
}

const COLORES = {
  industrial: "#b52a28",
  agropecuaria: "#24965B",
  pesquera: "#2878B5",
};

// Paleta diferenciada para las 13 regiones.
const COLORES_REGION: Record<string, string> = {
  I: "#E76F51",
  II: "#F4A261",
  III: "#E9C46A",
  IV: "#A8B95A",
  V: "#2A9D8F",
  VI: "#38A3A5",
  VII: "#457B9D",
  VIII: "#577590",
  IX: "#7B6DAB",
  X: "#9B5DE5",
  XI: "#C06C84",
  XII: "#D65A7A",
  XIII: "#8D6E63",
};

const RENDERER_CANVAS = L.canvas({
  padding: 0.5,
});

function crearIconoEscuela(escuela: Escuela) {
  const color = COLORES[escuela.modalidad];
  // El número de escuela se obtiene del nombre, no de la CCT.
  const numero = escuela.nombre.match(/(?:Num\.?|No\.?|Núm\.?|Número)\s*(\d+)/i)?.[1];
  const numeroTecnica = numero ? String(Number(numero)) : "";
  return L.divIcon({
    className: "school-marker-container",
    html: `
      <div style="
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: ${color};
        border: 2px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 1px 5px rgba(0,0,0,0.5);
        box-sizing: border-box;
        color: #ffffff;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
      ">
        ${numeroTecnica}
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function AjustarVista({ feature }: { feature: VeracruzFeature }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.geoJSON(feature).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [25, 25] });
      map.setMaxBounds(bounds.pad(0.35));
      map.setMinZoom(7);
      map.setMaxZoom(14);
    }
  }, [feature, map]);
  return null;
}


function EjecutarSeleccion({
  seleccion,
  municipios,
  celdasRegionales,
  marcadores,
}: {
  seleccion: SeleccionMapa | null;
  municipios: FeatureCollection;
  celdasRegionales: Feature[];
  marcadores: MutableRefObject<Map<string, L.Marker>>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!seleccion) return;

    if (seleccion.tipo === "escuela") {
      const escuela = seleccion.escuela;
      const marcador = marcadores.current.get(escuela.cct);
      if (!marcador) return;

      const destino: L.LatLngExpression = [escuela.latitud, escuela.longitud];
      const abrirPopup = () => marcador.openPopup();

      if (
        map.getZoom() >= 13 &&
        map.getCenter().distanceTo(L.latLng(escuela.latitud, escuela.longitud)) < 30
      ) {
        abrirPopup();
      } else {
        map.once("moveend", abrirPopup);
        map.flyTo(destino, 13, { duration: 0.8 });
      }
      return () => {
        map.off("moveend", abrirPopup);
      };
    }

    if (seleccion.tipo === "municipio") {
      const nombreBuscado = normalizarTexto(seleccion.nombre);
      const municipio = municipios.features.find((feature) => {
        const propiedades = feature.properties ?? {};
        const nombre =
          propiedades.nomgeo ??
          propiedades.NOMGEO ??
          propiedades.NOM_MUN ??
          propiedades.nombre ??
          "";
        return normalizarTexto(String(nombre)) === nombreBuscado;
      });

      if (municipio) {
        const bounds = L.geoJSON(municipio as never).getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [35, 35], maxZoom: 12, animate: true });
        }
      }
      return;
    }

    const celdasRegion = celdasRegionales
      .filter((celda) => String(celda.properties?.regionId ?? "") === seleccion.regionId)
      .map((celda) => L.geoJSON(celda as never));

    if (celdasRegion.length > 0) {
      const bounds = L.featureGroup(celdasRegion).getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [35, 35], maxZoom: 10, animate: true });
      }
    }
  }, [seleccion, municipios, celdasRegionales, marcadores, map]);

  return null;
}

function crearCeldasVoronoi(
  escuelas: Escuela[],
  estado: VeracruzFeature
): Feature[] {
  const puntos = featureCollection(
    escuelas
      .filter((escuela) => escuela.regionId && COLORES_REGION[escuela.regionId])
      .map((escuela) =>
        point([escuela.longitud, escuela.latitud], {
          regionId: escuela.regionId,
          cct: escuela.cct,
        })
      )
  );
  if (puntos.features.length < 2) return [];
  const bounds = L.geoJSON(estado).getBounds();
  const bbox: [number, number, number, number] = [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ];
  // Turf genera las celdas dentro del rectángulo envolvente del estado.
  // No intersectamos individualmente las 163 celdas con el contorno estatal,
  // porque esa operación sobre una geometría estatal compleja puede bloquear
  // el hilo principal y dejar la pantalla de carga sin terminar.
  const resultado = voronoi(puntos, { bbox });
  return resultado.features
    .filter((celda) => Boolean(celda?.geometry))
    .map((celda) => {
      const punto = puntos.features.find(
        (item) => item.properties?.cct === celda.properties?.cct
      );
      return {
        ...celda,
        properties: {
          ...celda.properties,
          regionId: celda.properties?.regionId ?? punto?.properties?.regionId,
        },
      } as Feature;
    })
    .filter((celda) =>
      Boolean(COLORES_REGION[String(celda.properties?.regionId ?? "")])
    );
}

function MapView({ seleccion, onDatosCargados }: MapViewProps) {
  const [veracruz, setVeracruz] = useState<VeracruzFeature | null>(null);
  const [municipios, setMunicipios] = useState<FeatureCollection | null>(null);
  const [mascara, setMascara] = useState<Feature | null>(null);
  const [escuelas, setEscuelas] = useState<Escuela[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [celdasRegionales, setCeldasRegionales] = useState<Feature[]>([]);
  const [error, setError] = useState("");
  const marcadores = useRef<Map<string, L.Marker>>(new Map());
  useEffect(() => {
    async function cargarDatos() {
      try {
        const [
          respuestaEstado,
          respuestaMunicipios,
          respuestaEscuelas,
          respuestaRegiones,
        ] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}data/veracruz.geojson`),
          fetch(`${import.meta.env.BASE_URL}data/municipios-veracruz.geojson`),
          fetch(`${import.meta.env.BASE_URL}data/escuelas-veracruz.json`),
          fetch(`${import.meta.env.BASE_URL}data/regiones-veracruz.json`),
        ]);
        if (!respuestaEstado.ok) {
          throw new Error("No se pudo cargar el archivo de Veracruz.");
        }
        if (!respuestaMunicipios.ok) {
          throw new Error("No se pudo cargar el archivo de municipios.");
        }
        if (!respuestaEscuelas.ok) {
          throw new Error("No se pudo cargar el archivo de escuelas.");
        }
        if (!respuestaRegiones.ok) {
          throw new Error("No se pudo cargar el catálogo de regiones.");
        }
        const datosEstado = await respuestaEstado.json();
        const datosMunicipios = await respuestaMunicipios.json();
        const datosEscuelas = await respuestaEscuelas.json();
        const datosRegiones = await respuestaRegiones.json();
        const estado: VeracruzFeature =
          datosEstado.type === "FeatureCollection"
            ? datosEstado.features[0]
            : datosEstado;
        if (!estado?.geometry) {
          throw new Error("La geometría de Veracruz no es válida.");
        }
        const coleccionMunicipios: FeatureCollection =
          datosMunicipios.type === "FeatureCollection"
            ? datosMunicipios
            : {
              type: "FeatureCollection",
              features: [datosMunicipios],
            };
        if (!coleccionMunicipios.features?.length) {
          throw new Error("No se encontraron municipios en el archivo.");
        }
        if (!Array.isArray(datosEscuelas.escuelas)) {
          throw new Error("El archivo de escuelas no tiene el formato esperado.");
        }
        if (!Array.isArray(datosRegiones.regiones)) {
          throw new Error("El catálogo de regiones no tiene el formato esperado.");
        }
        const escuelasValidas: Escuela[] = datosEscuelas.escuelas.filter(
          (escuela: Escuela) =>
            typeof escuela.latitud === "number" &&
            typeof escuela.longitud === "number" &&
            escuela.cct &&
            escuela.nombre &&
            escuela.regionId &&
            Object.hasOwn(COLORES, escuela.modalidad)
        );
        if (escuelasValidas.length === 0) {
          throw new Error("No se encontraron escuelas con coordenadas válidas.");
        }
        const exterior = polygon([
          [
            [-120, 10],
            [-80, 10],
            [-80, 35],
            [-120, 35],
            [-120, 10],
          ],
        ]);
        const resultado = difference(
          featureCollection([exterior, estado]) as never
        );
        setVeracruz(estado);
        setMunicipios(coleccionMunicipios);
        setMascara(resultado as Feature);
        setEscuelas(escuelasValidas);
        setRegiones(datosRegiones.regiones);
        onDatosCargados({
          escuelas: escuelasValidas,
          municipios: coleccionMunicipios.features.map((feature) => {
            const propiedades = feature.properties ?? {};
            return String(
              propiedades.nomgeo ??
              propiedades.NOMGEO ??
              propiedades.NOM_MUN ??
              propiedades.nombre ??
              ""
            );
          }).filter(Boolean),
          regiones: datosRegiones.regiones,
        });
        setCeldasRegionales(crearCeldasVoronoi(escuelasValidas, estado));
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error
            ? err.message
            : "Ocurrió un error al cargar los datos geográficos."
        );
      }
    }
    cargarDatos();
  }, [onDatosCargados]);
  if (error) {
    return <div className="map-message error">{error}</div>;
  }
  if (!veracruz || !municipios || !mascara) {
    return <div className="map-message">Cargando mapa de Veracruz...</div>;
  }
  return (
    <MapContainer
      center={[19.2, -96.2]}
      zoom={7}
      scrollWheelZoom
      preferCanvas={true}
      className="map-container"
    >
      <TileLayer
        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
        url={`https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png?key=${import.meta.env.VITE_CARTO_API_KEY}`}
        subdomains="abcd"
        maxZoom={20}
      />
      {/* Áreas de influencia Voronoi coloreadas por delegación regional */}
      {celdasRegionales.map((celda, indice) => {
        const regionId = String(celda.properties?.regionId ?? "");
        return (
          <GeoJSON
            key={`voronoi-${regionId}-${indice}`}
            data={celda as never}
            style={{
              color: "transparent",
              weight: 0,
              opacity: 0,
              fillColor: COLORES_REGION[regionId] ?? "#999999",
              fillOpacity: 0.32,
              renderer: RENDERER_CANVAS,
            }}
            interactive={false}
          />
        );
      })}
      {/* La máscara se dibuja encima de Voronoi para ocultar las celdas
          que quedan fuera de Veracruz, sin recortar cada celda por separado. */}
      <GeoJSON
        data={mascara as never}
        style={{
          fillColor: "#ffffff",
          fillOpacity: 1,
          color: "transparent",
          weight: 0,
          renderer: RENDERER_CANVAS,
        }}
        interactive={false}
      />
      {/* Relleno y contorno estatal */}
      <GeoJSON
        data={veracruz}
        style={{
          color: "#167D55",
          weight: 3,
          opacity: 1,
          fillColor: "#69B88A",
          fillOpacity: 0.04,
          renderer: RENDERER_CANVAS,
        }}
      />
      {/* Límites municipales */}
      <GeoJSON
        data={municipios}
        style={{
          color: "#333333",
          weight: 1,
          opacity: 0.85,
          fillColor: "#FFFFFF",
          fillOpacity: 0,
          renderer: RENDERER_CANVAS,
        }}
        onEachFeature={(feature, layer) => {
          const propiedades = feature.properties ?? {};
          const nombre =
            propiedades.nomgeo ??
            propiedades.NOMGEO ??
            propiedades.NOM_MUN ??
            propiedades.nombre ??
            "Municipio";
          layer.bindTooltip(String(nombre), {
            sticky: true,
            direction: "top",
            opacity: 0.95,
          });
        }}
      />
      {/* Contorno estatal */}
      <GeoJSON
        data={veracruz}
        style={{
          color: "#B85C18",
          weight: 3,
          fillOpacity: 0,
          interactive: false,
          renderer: RENDERER_CANVAS,
        }}
      />
      {/* Agrupación de marcadores */}
      <MarkerClusterGroup
        chunkedLoading
        showCoverageOnHover={false}
        spiderfyOnMaxZoom
        zoomToBoundsOnClick
        disableClusteringAtZoom={12}
        maxClusterRadius={25}
        iconCreateFunction={(cluster: L.MarkerCluster) => {
          const cantidad = cluster.getChildCount();
          return L.divIcon({
            className: "school-cluster-container",
            html: `
                <div style="
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                background-color: #7b7b7b;
                border: 3px solid #ffffff;
                border-radius: 50%;
                box-shadow: 0 2px 8px rgba(0,0,0,0.35);
                color: #ffffff;
                font-size: 14px;
                font-weight: 700;
                line-height: 1;
                box-sizing: border-box;
                ">
                +${cantidad}
                </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          });
        }}
      >
        {escuelas.map((escuela) => (
          <Marker
            ref={(marcador) => {
              if (marcador) marcadores.current.set(escuela.cct, marcador);
              else marcadores.current.delete(escuela.cct);
            }}
            key={escuela.cct}
            position={[escuela.latitud, escuela.longitud]}
            icon={crearIconoEscuela(escuela)}
          >
            <Popup>
              <div className="school-popup">
                <strong>{escuela.nombre}</strong>
                <p>
                  <b>CCT:</b> {escuela.cct}
                </p>
                <p>
                  <b>Modalidad:</b> {escuela.modalidad}
                </p>
                <p>
                  <b>Delegación regional:</b> {regiones.find((region) => region.id === escuela.regionId)?.nombre ?? "Sin región"}
                </p>
                <p>
                  <b>Municipio:</b> {escuela.municipio}
                </p>
                <p>
                  <b>Localidad:</b> {escuela.localidad}
                </p>
                <p>
                  <b>Domicilio:</b> {escuela.domicilio || "Sin dato"}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
      <EjecutarSeleccion
        seleccion={seleccion}
        municipios={municipios}
        celdasRegionales={celdasRegionales}
        marcadores={marcadores}
      />
      <AjustarVista feature={veracruz} />
    </MapContainer>
  );
}

export default MapView;