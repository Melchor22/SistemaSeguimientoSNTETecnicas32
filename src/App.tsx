import { useCallback, useMemo, useState } from "react";
import MapView, {
  type DatosBusqueda,
  type Escuela,
  type SeleccionMapa,
} from "./components/map/MapView";
import "./App.css";

type ResultadoBusqueda =
  | { tipo: "escuela"; escuela: Escuela; etiqueta: string; detalle: string }
  | { tipo: "municipio"; nombre: string; etiqueta: string; detalle: string }
  | { tipo: "region"; regionId: string; nombre: string; etiqueta: string; detalle: string };

function normalizarTexto(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim();
}

function obtenerNumeroEscuela(nombre: string) {
  const numero = nombre.match(/(?:Num\.?|No\.?|Núm\.?|Número)\s*(\d+)/i)?.[1];
  return numero ? String(Number(numero)) : "";
}

function App() {
  const [datos, setDatos] = useState<DatosBusqueda | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [resultadosAbiertos, setResultadosAbiertos] = useState(false);
  const [seleccion, setSeleccion] = useState<SeleccionMapa | null>(null);

  const recibirDatos = useCallback((nuevosDatos: DatosBusqueda) => {
    setDatos(nuevosDatos);
  }, []);

  const resultados = useMemo<ResultadoBusqueda[]>(() => {
    const termino = normalizarTexto(busqueda);
    if (!termino || !datos) return [];

    const encontrados: ResultadoBusqueda[] = [];

    // Los municipios y regiones se agregan antes que las escuelas para
    // priorizar la navegación territorial cuando el nombre coincide.
    datos.municipios
      .filter((municipio) => normalizarTexto(municipio).includes(termino))
      .slice(0, 5)
      .forEach((nombre) => {
        encontrados.push({
          tipo: "municipio",
          nombre,
          etiqueta: nombre,
          detalle: "Municipio",
        });
      });

      datos.regiones
      .filter((region) =>
        normalizarTexto(`${region.id} ${region.nombre}`).includes(termino)
      )
      .slice(0, 5)
      .forEach((region) => {
        encontrados.push({
          tipo: "region",
          regionId: region.id,
          nombre: region.nombre,
          etiqueta: `${region.id}. ${region.nombre}`,
          detalle: "Delegación regional",
        });
      });

      datos.escuelas
      .filter((escuela) => {
        const numero = obtenerNumeroEscuela(escuela.nombre);
        const region = datos.regiones.find((item) => item.id === escuela.regionId);
        const campos = [
          escuela.nombre,
          numero,
          escuela.modalidad,
          escuela.municipio,
          escuela.regionId,
          region?.nombre ?? "",
          escuela.cct,
        ];
        return campos.some((campo) => normalizarTexto(String(campo)).includes(termino));
      })
      .slice(0, 8)
      .forEach((escuela) => {
        encontrados.push({
          tipo: "escuela",
          escuela,
          etiqueta: escuela.nombre,
          detalle: `${escuela.cct} · ${escuela.municipio} · ${escuela.modalidad}`,
        });
      });

    return encontrados.slice(0, 12);
  }, [busqueda, datos]);

  const seleccionarResultado = (resultado: ResultadoBusqueda) => {
    if (resultado.tipo === "escuela") {
      setSeleccion({ tipo: "escuela", escuela: resultado.escuela });
    } else if (resultado.tipo === "municipio") {
      setSeleccion({ tipo: "municipio", nombre: resultado.nombre });
    } else {
      setSeleccion({ tipo: "region", regionId: resultado.regionId });
    }

    setBusqueda(resultado.etiqueta);
    setResultadosAbiertos(false);
  };

  return (
    <main className="app">
      <header className="app-header">
        <div className="header-title">
          <h1>Mapa Escolar de Veracruz</h1>
          <p>Directorio geográfico de escuelas secundarias técnicas</p>
        </div>

        <div className="search-container">
          <div className="search-input-wrapper">
            <svg
              className="search-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path d="m16 16 5 5" />
            </svg>
            <input
              type="search"
              value={busqueda}
              placeholder="Buscar escuela, número, modalidad, municipio, región o CCT..."
              aria-label="Buscar escuelas, municipios o regiones"
              onChange={(event) => {
                setBusqueda(event.target.value);
                setResultadosAbiertos(true);
              }}
              onFocus={() => setResultadosAbiertos(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setResultadosAbiertos(false);
                if (event.key === "Enter" && resultados.length === 1) {
                  seleccionarResultado(resultados[0]);
                }
              }}
            />
            {busqueda && (
              <button
                type="button"
                className="clear-search"
                aria-label="Limpiar búsqueda"
                onClick={() => {
                  setBusqueda("");
                  setSeleccion(null);
                  setResultadosAbiertos(true);
                }}
              >
                ×
              </button>
            )}
          </div>

          {resultadosAbiertos && busqueda.trim() && (
            <div className="search-results">
              {!datos ? (
                <div className="search-empty">Cargando información...</div>
              ) : resultados.length === 0 ? (
                <div className="search-empty">No se encontraron coincidencias.</div>
              ) : (
                <>
                  <div className="search-results-heading">
                    {resultados.length} resultado(s)
                  </div>
                  {resultados.map((resultado, indice) => (
                    <button
                      type="button"
                      className="search-result"
                      key={`${resultado.tipo}-${resultado.tipo === "escuela" ? resultado.escuela.cct : resultado.tipo === "municipio" ? resultado.nombre : resultado.regionId}-${indice}`}
                      onClick={() => seleccionarResultado(resultado)}
                    >
                      <span className={`result-type result-${resultado.tipo}`}>
                        {resultado.tipo === "escuela"
                          ? "Escuela"
                          : resultado.tipo === "municipio"
                            ? "Municipio"
                            : "Región"}
                      </span>
                      <span className="result-content">
                        <strong>{resultado.etiqueta}</strong>
                        <small>{resultado.detalle}</small>
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <section className="map-section" onClick={() => resultadosAbiertos && setResultadosAbiertos(false)}>
        <MapView
          seleccion={seleccion}
          onDatosCargados={recibirDatos}
        />
      </section>
    </main>
  );
}

export default App;