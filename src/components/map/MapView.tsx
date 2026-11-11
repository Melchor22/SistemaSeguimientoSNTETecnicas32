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

import MarkerClusterGroup from "react-leaflet-cluster";

import "leaflet.markercluster";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";

import { featureCollection } from "@turf/helpers";
import { union } from "@turf/union";
import { pointOnFeature } from "@turf/point-on-feature";

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
  I: "#E63946",     // Rojo
  II: "#4361EE",    // Azul intenso
  III: "#F4A261",   // Naranja
  IV: "#7209B7",    // Morado
  V: "#84A98C",     // Verde salvia
  VI: "#F72585",    // Rosa intenso
  VII: "#E9C46A",   // Amarillo
  VIII: "#2A9D8F",  // Verde turquesa
  IX: "#9B5DE5",    // Violeta
  X: "#D65A31",     // Terracota
  XI: "#4895EF",    // Azul claro
  XII: "#C06C84",   // Rosa apagado
  XIII: "#6C757D",  // Gris azulado
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
      map.setMaxZoom(18);
    }
  }, [feature, map]);
  return null;
}

function RegionesVoronoi({
  celdasRegionales,
}: {
  celdasRegionales: Feature[];
}) {
  const map = useMap();
  const capasRef = useRef<L.GeoJSON[]>([]);

  useEffect(() => {
    const actualizarTransparencia = () => {
      const zoom = map.getZoom();

      // Reduce progresivamente la opacidad a partir del zoom 10.
      const opacidad = Math.max(
        0,
        Math.min(0.50, 0.50 - (zoom - 9) * 0.1)
      );

      capasRef.current.forEach((capa) => {
        capa.setStyle({
          fillOpacity: opacidad,
        });
      });
    };

    actualizarTransparencia();

    map.on("zoomend", actualizarTransparencia);

    return () => {
      map.off("zoomend", actualizarTransparencia);
    };
  }, [map]);

  return (
    <>
      {celdasRegionales.map((celda, indice) => {
        const regionId = String(celda.properties?.regionId ?? "");

        return (
          <GeoJSON
            key={`voronoi-${regionId}-${indice}`}
            data={celda as never}
            ref={(capa) => {
              if (capa) {
                capasRef.current[indice] = capa;
              }
            }}
            style={{
              color: "transparent",
              weight: 0,
              fillColor: COLORES_REGION[regionId] ?? "#999999",
              fillOpacity: 0.50,
              renderer: RENDERER_CANVAS,
            }}
            interactive={false}
          />
        );
      })}
    </>
  );
}

function EtiquetasRegionales({
  celdasRegionales,
  regiones,
}: {
  celdasRegionales: Feature[];
  regiones: Region[];
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const actualizarZoom = () => setZoom(map.getZoom());

    map.on("zoomend", actualizarZoom);

    return () => {
      map.off("zoomend", actualizarZoom);
    };
  }, [map]);

  const posiciones: {
    id: string;
    nombre: string;
    posicion: L.LatLng;
  }[] = [];

  regiones.forEach((region) => {
    // Obtiene todas las celdas pertenecientes a la región.
    const celdas = celdasRegionales.filter(
      (celda) =>
        String(celda.properties?.regionId ?? "") === region.id
    );

    if (!celdas.length) return;

    try {
      // Conserva únicamente las geometrías Polygon y MultiPolygon.
      const celdasValidas: Feature<Polygon | MultiPolygon>[] =
        celdas.filter(
          (
            celda
          ): celda is Feature<Polygon | MultiPolygon> =>
            celda.geometry.type === "Polygon" ||
            celda.geometry.type === "MultiPolygon"
        );

      if (!celdasValidas.length) return;

      // Construye una colección con todas las celdas de la región.
      const coleccion = featureCollection(celdasValidas);

      // Une todas las geometrías en una sola superficie regional.
      const geometriaUnida = union(coleccion);

      if (!geometriaUnida) return;

      // Calcula un punto interior de toda la región.
      const punto = pointOnFeature(geometriaUnida);

      const [longitud, latitud] = punto.geometry.coordinates;

      posiciones.push({
        id: region.id,
        nombre: `${region.id} ${region.nombre.toLocaleUpperCase("es-MX")}`,
        posicion: L.latLng(latitud, longitud),
      });
    } catch (error) {
      console.error(
        `Error al calcular la posición de la región ${region.nombre}:`,
        error
      );
    }
  });

  // Las etiquetas permanecen visibles desde el zoom mínimo.
  if (zoom < 5) return null;

  return (
    <>
      {posiciones.map((region) => (
        <Marker
          key={`region-label-${region.id}`}
          position={region.posicion}
          interactive={false}
          keyboard={false}
          zIndexOffset={10000}
          icon={L.divIcon({
            className: "region-label-container",
            html: `
              <div class="region-label">
                <span class="region-label-id">${region.id}</span>
                <span class="region-label-name">
                  ${region.nombre.replace(region.id, "").trim()}
                </span>
              </div>
            `,
            iconSize: [200, 38],
            iconAnchor: [100, 19],
          })}
        />
      ))}
    </>
  );
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
          respuestaMascara,
          respuestaCeldas,
        ] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}data/veracruz-simplificado.geojson`),
          fetch(`${import.meta.env.BASE_URL}data/municipios-veracruz-simplificado.geojson`),
          fetch(`${import.meta.env.BASE_URL}data/escuelas-veracruz.json`),
          fetch(`${import.meta.env.BASE_URL}data/regiones-veracruz.json`),
          fetch(`${import.meta.env.BASE_URL}data/mascara-veracruz.geojson`),
          fetch(`${import.meta.env.BASE_URL}data/celdas-regionales-veracruz.geojson`),
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

        if (!respuestaMascara.ok) {
          throw new Error("No se pudo cargar la máscara de Veracruz.");
        }

        if (!respuestaCeldas.ok) {
          throw new Error("No se pudieron cargar las áreas regionales recortadas.");
        }

        const datosEstado = await respuestaEstado.json();
        const datosMunicipios = await respuestaMunicipios.json();
        const datosEscuelas = await respuestaEscuelas.json();
        const datosRegiones = await respuestaRegiones.json();
        const datosMascara = await respuestaMascara.json();
        const datosCeldas = await respuestaCeldas.json();

        const estado: VeracruzFeature =
          datosEstado.type === "FeatureCollection"
            ? datosEstado.features[0]
            : datosEstado;

        if (!estado?.geometry) {
          throw new Error("La geometría simplificada de Veracruz no es válida.");
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

        setVeracruz(estado);
        setMunicipios(coleccionMunicipios);
        setMascara(datosMascara as Feature);
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

        if (!Array.isArray(datosCeldas.features)) {
          throw new Error("El archivo de áreas regionales no tiene el formato esperado.");
        }
        setCeldasRegionales(datosCeldas.features as Feature[]);

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
        url={`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${import.meta.env.VITE_CARTO_API_KEY}`}
        subdomains="abcd"
        maxZoom={20}
      />

      {/* Áreas de influencia Voronoi coloreadas por delegación regional */}
      <RegionesVoronoi celdasRegionales={celdasRegionales} />

      {/* Etiquetas de las delegaciones regionales */}
      <EtiquetasRegionales
        celdasRegionales={celdasRegionales}
        regiones={regiones}
      />

      {/* La máscara se dibuja encima de Voronoi para ocultar las celdas
          que quedan fuera de Veracruz, sin recortar cada celda por separado. */}
      <GeoJSON
        data={mascara as never}
        style={{
          fillColor: "#000000",
          fillOpacity: 0.45,
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