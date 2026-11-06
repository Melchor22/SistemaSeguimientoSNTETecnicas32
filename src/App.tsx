
import MapView from "./components/map/MapView";
import "./App.css";

function App() {
  return (
    <main className="app">
      <header className="app-header">
        <div>
          <h1>Mapa Escolar de Veracruz</h1>
          <p>Directorio geográfico de escuelas secundarias técnicas</p>
        </div>
      </header>

      <section className="map-section">
        <MapView />
      </section>
    </main>
  );
}

export default App;