
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Coordinate, DrawingMode, MapLayer, ReportMetadata, BoundaryStyle } from './types';
import { MAP_LAYERS, PRINT_MAP_WIDTH_MM } from './constants';

declare const L: any;
declare const turf: any;
declare const html2canvas: any;
declare const JSZip: any;

const THEMES: BoundaryStyle[] = [
  { color: '#10b981', fillColor: 'rgba(16, 185, 129, 0.2)', label: 'Forest' },
  { color: '#fbbf24', fillColor: 'rgba(251, 191, 36, 0.2)', label: 'Hazard' },
  { color: '#0ea5e9', fillColor: 'rgba(14, 165, 233, 0.2)', label: 'Nautical' },
  { color: '#f43f5e', fillColor: 'rgba(244, 63, 94, 0.2)', label: 'Tactical' },
  { color: '#000000', fillColor: 'rgba(0, 0, 0, 0.1)', label: 'Technical' },
];

const POINT_SYMBOLS = [
  { icon: 'fa-location-dot', label: 'Marker', cat: 'General' },
  { icon: 'fa-flag', label: 'Batas', cat: 'General' },
  { icon: 'fa-tree', label: 'Pohon', cat: 'Nature' },
  { icon: 'fa-house', label: 'Rumah', cat: 'Arch' },
  { icon: 'fa-bolt', label: 'Listrik', cat: 'Utility' },
  { icon: 'fa-triangle-exclamation', label: 'Bahaya', cat: 'Safety' },
];

const WelcomeGuide: React.FC<{ onFinish: () => void }> = ({ onFinish }) => (
  <div className="fixed inset-0 z-[2000] bg-slate-950/90 backdrop-blur-2xl flex items-center justify-center p-6 text-white text-center">
    <div className="max-w-xs w-full bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-300">
      <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-600/30">
        <i className="fa-solid fa-compass text-2xl"></i>
      </div>
      <h2 className="text-xl font-black mb-4 uppercase tracking-tighter">Montana Terminal</h2>
      <div className="space-y-4 mb-8 text-left text-slate-400">
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
          <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center">1</div>
          <span>Pilih Mode Survei</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
          <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center">2</div>
          <span>Atur Judul & Legenda</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
          <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center">3</div>
          <span>Ekspor Skala 1:25.000</span>
        </div>
      </div>
      <button onClick={onFinish} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-[0.2em] active:scale-95 transition-all">Mulai</button>
    </div>
  </div>
);

const App: React.FC = () => {
  const [view, setView] = useState<'FIELD' | 'CONFIG' | 'PRINT'>('FIELD');
  const [mode, setMode] = useState<DrawingMode>('NONE');
  const [coords, setCoords] = useState<Coordinate[]>([]);
  const [layer, setLayer] = useState<MapLayer>('STREET');
  const [activeTheme, setActiveTheme] = useState<BoundaryStyle>(THEMES[0]);
  const [activeSymbol, setActiveSymbol] = useState(POINT_SYMBOLS[0]);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<(Coordinate & { id: number }) | null>(null);
  const [reportScaleUI, setReportScaleUI] = useState(1);
  const [isHudMinimized, setIsHudMinimized] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const [metadata, setMetadata] = useState<ReportMetadata>({
    title: 'LAPORAN HASIL SURVEI',
    subtitle: 'ANALISIS GEOSPASIAL TERPADU',
    surveyor: 'SURVEYOR_GIS',
    scale: 0, // 0 = Auto
    date: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }),
    legendOverrides: {}
  });

  const mapRef = useRef<any>(null);
  const printMapRef = useRef<any>(null);
  const insetMapRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);
  const printLayerGroupRef = useRef<any>(null);
  const insetLayerGroupRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);

  const [stats, setStats] = useState({ distance: 0, area: 0 });
  const [gridLabels, setGridLabels] = useState({ top: [], bottom: [], left: [], right: [] });

  useEffect(() => {
    const hasSeen = localStorage.getItem('montana_v11_guide');
    if (!hasSeen) setShowWalkthrough(true);
  }, []);

  useEffect(() => {
    if (view === 'PRINT') {
      const winWidth = window.innerWidth;
      const reportWidth = 1122; 
      if (winWidth < reportWidth) {
        setReportScaleUI((winWidth - 40) / reportWidth);
      } else {
        setReportScaleUI(1);
      }
    }
  }, [view]);

  const resetProject = () => {
    setCoords([]);
    setMode('NONE');
    setSelectedPoint(null);
    setIsResetting(false);
  };

  const handleUndo = () => {
    if (coords.length > 0) {
      setCoords(prev => prev.slice(0, -1));
    }
  };

  const handleExportKMZ = async () => {
    if (coords.length === 0) return;
    setIsExporting(true);

    try {
      const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${metadata.title}</name>
    <description>${metadata.subtitle}</description>
    <Style id="polyStyle">
      <LineStyle><color>ff0000ff</color><width>4</width></LineStyle>
      <PolyStyle><color>400000ff</color></PolyStyle>
    </Style>
    <Style id="lineStyle">
      <LineStyle><color>ff00aaff</color><width>4</width></LineStyle>
    </Style>`;

      let kmlBody = '';
      
      coords.forEach((c, i) => {
        const label = metadata.legendOverrides?.[i+1] || c.label || `Point ${i+1}`;
        kmlBody += `
    <Placemark>
      <name>${label}</name>
      <Point>
        <coordinates>${c.lng},${c.lat},0</coordinates>
      </Point>
    </Placemark>`;
      });

      if (mode === 'DISTANCE' && coords.length >= 2) {
        kmlBody += `
    <Placemark>
      <name>Survey Path (Distance)</name>
      <styleUrl>#lineStyle</styleUrl>
      <LineString>
        <coordinates>
          ${coords.map(c => `${c.lng},${c.lat},0`).join(' ')}
        </coordinates>
      </LineString>
    </Placemark>`;
      }

      if (mode === 'AREA' && coords.length >= 3) {
        kmlBody += `
    <Placemark>
      <name>Survey Area</name>
      <styleUrl>#polyStyle</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${coords.map(c => `${c.lng},${c.lat},0`).join(' ')}
              ${coords[0].lng},${coords[0].lat},0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;
      }

      const kmlFooter = `
  </Document>
</kml>`;

      const fullKml = kmlHeader + kmlBody + kmlFooter;
      
      const zip = new JSZip();
      zip.file("doc.kml", fullKml);
      
      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `MONTANA_SURVEY_${new Date().getTime()}.kmz`;
      link.click();
    } catch (err) {
      console.error("KMZ Export failed", err);
      alert("Gagal mengekspor KMZ.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportImage = async () => {
    const reportElement = document.getElementById('report-frame');
    if (!reportElement) return;
    
    setIsExporting(true);
    try {
      const originalTransform = reportElement.style.transform;
      const originalMargin = reportElement.style.marginBottom;
      
      reportElement.style.transform = 'none';
      reportElement.style.marginBottom = '0px';

      const canvas = await html2canvas(reportElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      reportElement.style.transform = originalTransform;
      reportElement.style.marginBottom = originalMargin;

      const link = document.createElement('a');
      link.download = `MONTANA_GIS_REPORT_${new Date().getTime()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error("Export failed", err);
      alert("Gagal mengekspor gambar.");
    } finally {
      setIsExporting(false);
    }
  };

  // Lifecycle Peta Utama (FIELD)
  useEffect(() => {
    if (view !== 'FIELD') return;
    if (!mapRef.current) {
      const map = L.map('map', { 
        zoomControl: false, attributionControl: false, tap: true, maxZoom: 20
      }).setView([-6.2, 106.81], 13);
      L.tileLayer(MAP_LAYERS[layer], { maxZoom: 20 }).addTo(map);
      layerGroupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      map.on('click', (e: any) => {
        if (selectedPoint) { setSelectedPoint(null); return; }
        if (isResetting) return;
        setCoords(prev => [...prev, { 
          lat: e.latlng.lat, lng: e.latlng.lng, 
          color: activeTheme.color, symbol: activeSymbol.icon, label: activeSymbol.label
        }]);
      });
      map.locate({ setView: true, maxZoom: 16 });
      map.on('locationfound', (e: any) => {
        if (userMarkerRef.current) map.removeLayer(userMarkerRef.current);
        userMarkerRef.current = L.marker(e.latlng, { 
          icon: L.divIcon({ className: 'location-pulse', iconSize: [14, 14] }),
          zIndexOffset: 1000
        }).addTo(map);
      });
    } else {
      mapRef.current.eachLayer((l: any) => { if (l instanceof L.TileLayer) mapRef.current?.removeLayer(l); });
      L.tileLayer(MAP_LAYERS[layer], { maxZoom: 20 }).addTo(mapRef.current);
    }
  }, [view, layer, mode, activeSymbol, activeTheme, selectedPoint, isResetting]);

  // Sync Layers (FIELD)
  useEffect(() => {
    if (!layerGroupRef.current || !mapRef.current) return;
    layerGroupRef.current.clearLayers();
    if (coords.length === 0) { setStats({ distance: 0, area: 0 }); return; }

    coords.forEach((c, i) => {
      const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="w-10 h-10 rounded-2xl border-2 border-white flex items-center justify-center shadow-2xl transition-all" style="background-color: ${c.color || activeTheme.color}"><i class="fa-solid ${c.symbol || 'fa-location-dot'} text-white text-sm"></i></div>`,
        iconSize: [40, 40], iconAnchor: [20, 20]
      });
      const marker = L.marker([c.lat, c.lng], { icon });
      marker.on('click', (e: any) => { L.DomEvent.stopPropagation(e); setSelectedPoint({ ...c, id: i + 1 }); });
      marker.addTo(layerGroupRef.current!).bindTooltip(`P${i+1}`, { direction: 'top', className: 'field-tooltip', offset: [0, -15] });
    });

    const pts = coords.map(c => [c.lng, c.lat]);
    if (mode === 'DISTANCE' && coords.length >= 2) {
      L.polyline(coords.map(c => [c.lat, c.lng]), { color: activeTheme.color, weight: 6 }).addTo(layerGroupRef.current);
      const dist = turf.length(turf.lineString(pts), { units: 'kilometers' });
      setStats({ distance: dist, area: 0 });

      // Add distance label at midpoint
      const midIndex = Math.floor(coords.length / 2);
      const midCoord = coords[midIndex];
      const labelIcon = L.divIcon({
        className: 'distance-label-icon',
        html: `<div class="text-black text-xs font-black text-center drop-shadow-lg">
          ${(dist * 1000).toFixed(0)} m
        </div>`,
        iconSize: [0, 0], iconAnchor: [0, 0]
      });
      L.marker([midCoord.lat, midCoord.lng], { icon: labelIcon }).addTo(layerGroupRef.current);
    } else if (mode === 'AREA' && coords.length >= 3) {
      L.polygon(coords.map(c => [c.lat, c.lng]), { color: activeTheme.color, weight: 6, fillOpacity: 0.3 }).addTo(layerGroupRef.current);
      const areaVal = turf.area(turf.polygon([[...pts, pts[0]]]));
      const perimeterVal = turf.length(turf.lineString([...pts, pts[0]]), { units: 'kilometers' }) * 1000;
      setStats({ distance: perimeterVal, area: areaVal });

      // Add center label
      const centroid = turf.centroid(turf.polygon([[...pts, pts[0]]]));
      const centerLat = centroid.geometry.coordinates[1];
      const centerLng = centroid.geometry.coordinates[0];
      const labelIcon = L.divIcon({
        className: 'area-label-icon',
        html: `<div class="text-black text-xs font-black text-center drop-shadow-lg">
          ${(areaVal / 10000).toFixed(2)} ha
        </div>`,
        iconSize: [0, 0], iconAnchor: [0, 0]
      });
      L.marker([centerLat, centerLng], { icon: labelIcon }).addTo(layerGroupRef.current);
    } else {
      setStats({ distance: 0, area: 0 });
    }
  }, [coords, mode, activeTheme]);

  // Lifecycle Peta Laporan (PRINT) & INSET MAP
  useEffect(() => {
    if (view !== 'PRINT') return;
    const setupPrint = () => {
      if (printMapRef.current) printMapRef.current.remove();
      if (insetMapRef.current) insetMapRef.current.remove();

      const pMap = L.map('print-map', { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false });
      L.tileLayer(MAP_LAYERS[layer]).addTo(pMap);
      printLayerGroupRef.current = L.layerGroup().addTo(pMap);
      printMapRef.current = pMap;

      const iMap = L.map('inset-map', { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false });
      L.tileLayer(MAP_LAYERS.STREET).addTo(iMap);
      insetLayerGroupRef.current = L.layerGroup().addTo(iMap);
      insetMapRef.current = iMap;
      
      const bounds = new L.FeatureGroup(coords.map(c => L.marker([c.lat, c.lng]))).getBounds();
      const center = bounds.getCenter();

      let bMain;
      if (metadata.scale === 0) {
        pMap.fitBounds(bounds, { padding: [50, 50] });
        bMain = pMap.getBounds();
      } else {
        const groundWMain = (PRINT_MAP_WIDTH_MM * metadata.scale) / 1000;
        const dLatMain = (groundWMain * 0.7) / 111320;
        const dLngMain = groundWMain / (111320 * Math.cos(center.lat * Math.PI / 180));
        bMain = L.latLngBounds([center.lat - dLatMain/2, center.lng - dLngMain/2], [center.lat + dLatMain/2, center.lng + dLngMain/2]);
        pMap.fitBounds(bMain);
      }

      const insetScale = 50000;
      const groundWInset = (100 * insetScale) / 1000;
      const dLatInset = (groundWInset * 0.7) / 111320;
      const dLngInset = groundWInset / (111320 * Math.cos(center.lat * Math.PI / 180));
      const bInset = L.latLngBounds([center.lat - dLatInset/2, center.lng - dLngInset/2], [center.lat + dLatInset/2, center.lng + dLngInset/2]);
      iMap.fitBounds(bInset);

      L.rectangle(bMain, { color: '#ef4444', weight: 2, fillOpacity: 0.15, dashArray: '5, 5' }).addTo(iMap);

      coords.forEach((c, i) => {
        const customLabel = metadata.legendOverrides?.[i+1] || c.label;
        const icon = L.divIcon({
          className: 'print-div-icon',
          html: `<div class="w-10 h-10 border-2 border-black flex items-center justify-center bg-white shadow-sm"><i class="fa-solid ${c.symbol || 'fa-location-dot'} text-sm"></i></div>`,
          iconSize: [40, 40], iconAnchor: [20, 20]
        });
        L.marker([c.lat, c.lng], { icon }).addTo(printLayerGroupRef.current!);
        
        const labelMarker = L.divIcon({
          className: 'print-label-icon',
          html: `<div class="text-[11px] font-black text-black bg-white/90 px-1.5 py-0.5 rounded-lg border border-black shadow-sm leading-none whitespace-nowrap">P${i+1} ${customLabel !== 'Marker' ? ': ' + customLabel : ''}</div>`,
          iconSize: [0, 0], iconAnchor: [-15, 15]
        });
        L.marker([c.lat, c.lng], { icon: labelMarker }).addTo(printLayerGroupRef.current!);
      });

      if (mode === 'DISTANCE' && coords.length >= 2) L.polyline(coords.map(c => [c.lat, c.lng]), { color: '#000', weight: 5, dashArray: '10, 10' }).addTo(printLayerGroupRef.current!);
      if (mode === 'AREA' && coords.length >= 3) L.polygon(coords.map(c => [c.lat, c.lng]), { color: '#000', weight: 4, fillOpacity: 0.2, fillColor: activeTheme.color }).addTo(printLayerGroupRef.current!);
      
      const finalBounds = pMap.getBounds();
      setGridLabels({ 
        top: [finalBounds.getWest() + (finalBounds.getEast()-finalBounds.getWest())*0.25, finalBounds.getWest() + (finalBounds.getEast()-finalBounds.getWest())*0.75].map(v => v.toFixed(4)), 
        bottom: [finalBounds.getWest() + (finalBounds.getEast()-finalBounds.getWest())*0.25, finalBounds.getWest() + (finalBounds.getEast()-finalBounds.getWest())*0.75].map(v => v.toFixed(4)), 
        left: [finalBounds.getSouth() + (finalBounds.getNorth()-finalBounds.getSouth())*0.25, finalBounds.getSouth() + (finalBounds.getNorth()-finalBounds.getSouth())*0.75].map(v => v.toFixed(4)), 
        right: [finalBounds.getSouth() + (finalBounds.getNorth()-finalBounds.getSouth())*0.25, finalBounds.getSouth() + (finalBounds.getNorth()-finalBounds.getSouth())*0.75].map(v => v.toFixed(4)) 
      });
    };
    setTimeout(setupPrint, 500);
  }, [view, metadata, coords, mode, layer]);

  const usedSymbols = useMemo(() => {
    const syms: any[] = [];
    const seen = new Set();
    coords.forEach((c, i) => {
      const customLabel = metadata.legendOverrides?.[i+1] || c.label || 'Marker';
      const key = `${c.symbol || 'fa-location-dot'}-${customLabel}`;
      if (!seen.has(key)) {
        seen.add(key);
        syms.push({ symbol: c.symbol || 'fa-location-dot', label: customLabel });
      }
    });
    if (mode === 'DISTANCE' && coords.length >= 2) {
      const distanceM = (stats.distance * 1000).toFixed(0);
      syms.push({ isDistance: true, color: activeTheme.color, label: 'Jalur Survei', distance: distanceM });
    }
    if (mode === 'AREA' && coords.length >= 3) {
      const areaHa = (stats.area / 10000).toFixed(2);
      const perimeterM = stats.distance.toFixed(0);
      syms.push({ isArea: true, color: activeTheme.color, label: `${activeTheme.label} Zone`, area: areaHa, perimeter: perimeterM });
    }
    return syms;
  }, [coords, mode, activeTheme, metadata.legendOverrides, stats]);

  const reviewData = useMemo(() => {
    if (coords.length === 0) return null;
    const lastCoord = coords[coords.length - 1];
    
    if (mode === 'POINT') {
      return (
        <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-300">
           <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Koordinat Terakhir</span>
           <div className="font-mono text-xs font-bold text-white bg-white/5 px-3 py-1 rounded-lg border border-white/10">
              {lastCoord.lat.toFixed(6)}, {lastCoord.lng.toFixed(6)}
           </div>
        </div>
      );
    }
    
    if (mode === 'DISTANCE' && coords.length >= 2) {
      const meters = (stats.distance * 1000).toFixed(2);
      return (
        <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-300">
           <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Tinjauan Jarak</span>
           <div className="text-xl font-black text-white tracking-tight">
              {meters} <span className="text-[10px] text-blue-400 ml-1">METER</span>
           </div>
        </div>
      );
    }
    
    if (mode === 'AREA' && coords.length >= 3) {
      const hectares = (stats.area / 10000).toFixed(4);
      return (
        <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-300">
           <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Tinjauan Luas</span>
           <div className="flex gap-4">
              <div className="text-center">
                 <div className="text-lg font-black text-white">{hectares}</div>
                 <div className="text-[8px] font-black text-emerald-400">HA</div>
              </div>
              <div className="w-[1px] h-8 bg-white/10 self-center"></div>
              <div className="text-center">
                 <div className="text-lg font-black text-white">{stats.area.toFixed(2)}</div>
                 <div className="text-[8px] font-black text-emerald-400">M²</div>
              </div>
           </div>
        </div>
      );
    }
    
    return null;
  }, [coords, mode, stats]);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-950 select-none font-sans">
      {showWalkthrough && <WelcomeGuide onFinish={() => { localStorage.setItem('montana_v11_guide', 'true'); setShowWalkthrough(false); }} />}
      
      {isResetting && (
        <div className="fixed inset-0 z-[3000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-10 max-w-sm w-full shadow-2xl text-center transform animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-rose-600/20 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-8">
              <i className="fa-solid fa-triangle-exclamation text-3xl"></i>
            </div>
            <h2 className="text-xl font-black text-white uppercase tracking-tighter mb-4">Hapus Semua Data?</h2>
            <div className="flex gap-4">
              <button onClick={() => setIsResetting(false)} className="flex-1 bg-white/5 text-slate-400 font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest transition-all">Batal</button>
              <button onClick={resetProject} className="flex-1 bg-rose-600 text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest transition-all">Hapus</button>
            </div>
          </div>
        </div>
      )}

      {isExporting && (
        <div className="fixed inset-0 z-[5000] bg-blue-600/20 backdrop-blur-sm flex items-center justify-center flex-col gap-4 text-white">
          <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
          <span className="font-black uppercase tracking-[0.3em] text-[10px]">Menyiapkan Berkas...</span>
        </div>
      )}

      {view === 'CONFIG' && (
        <div className="fixed inset-0 z-[1500] bg-slate-950 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-8 bg-blue-600 text-white shrink-0">
              <h2 className="text-2xl font-black uppercase tracking-tighter">Konfigurasi Laporan</h2>
              <p className="text-[10px] font-bold opacity-70 tracking-widest uppercase">Lengkapi detail judul dan skala sebelum diterbitkan</p>
            </div>
            <div className="flex-grow overflow-y-auto p-8 space-y-10 custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Judul Laporan</label>
                  <input className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all" value={metadata.title} onChange={e => setMetadata({...metadata, title: e.target.value.toUpperCase()})} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Sub-Judul Analisis</label>
                  <input className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all" value={metadata.subtitle} onChange={e => setMetadata({...metadata, subtitle: e.target.value.toUpperCase()})} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Pilih Skala Cetak</label>
                  <select 
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all text-white"
                    value={metadata.scale}
                    onChange={e => setMetadata({...metadata, scale: Number(e.target.value)})}
                  >
                    <option value={0}>Otomatis (Sesuaikan Titik)</option>
                    <option value={5000}>1:5.000 (Sangat Detail)</option>
                    <option value={10000}>1:10.000 (Detail)</option>
                    <option value={25000}>1:25.000 (Standar RBI)</option>
                    <option value={50000}>1:50.000 (Regional)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Nama Surveyor</label>
                  <input className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all" value={metadata.surveyor} onChange={e => setMetadata({...metadata, surveyor: e.target.value.toUpperCase()})} />
                </div>
              </div>
              
              <div className="pt-6 border-t border-white/5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-4 flex items-center gap-2">
                  <i className="fa-solid fa-list-check"></i> Kustom Nama Legenda (Poin Survei)
                </label>
                <div className="space-y-3">
                  {coords.map((c, i) => (
                    <div key={i} className="flex items-center gap-4 bg-black/20 p-4 rounded-2xl border border-white/5 hover:border-blue-500/50 transition-all">
                      <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-black text-xs border border-blue-500/30">P{i+1}</div>
                      <input 
                        className="flex-grow bg-transparent border-b border-white/10 py-2 text-sm outline-none focus:border-blue-500 placeholder:text-slate-600" 
                        placeholder={`Beri nama untuk titik P${i+1} (mis: Batas Utara)`}
                        value={metadata.legendOverrides?.[i+1] || ""} 
                        onChange={e => setMetadata({
                          ...metadata, 
                          legendOverrides: { ...metadata.legendOverrides, [i+1]: e.target.value }
                        })}
                      />
                    </div>
                  ))}
                  {coords.length === 0 && (
                    <div className="text-center py-6 text-slate-500 text-xs italic">Tidak ada titik yang ditemukan.</div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-8 border-t border-white/5 flex gap-4 shrink-0 bg-slate-900/50">
              <button onClick={() => setView('FIELD')} className="flex-1 bg-white/5 hover:bg-white/10 text-slate-400 font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest transition-all">Kembali</button>
              <button onClick={() => setView('PRINT')} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest shadow-xl shadow-blue-600/20 transition-all active:scale-95">Terbitkan Laporan</button>
            </div>
          </div>
        </div>
      )}

      <div id="app-view" className={view === 'FIELD' ? "relative h-full flex flex-col no-print overflow-hidden" : "hidden"}>
        <div id="map" className="absolute inset-0 z-0 h-full w-full"></div>
        <div className="absolute top-6 right-6 z-[200] flex flex-col gap-4">
          <button onClick={() => mapRef.current?.locate({ setView: true })} className="w-14 h-14 bg-white text-blue-600 rounded-2xl flex items-center justify-center shadow-2xl border border-white/20 transition-transform active:scale-90"><i className="fa-solid fa-location-crosshairs text-xl"></i></button>
          <button onClick={() => setLayer(layer === 'STREET' ? 'SATELLITE' : 'STREET')} className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-2xl transition-all active:scale-90"><i className={`fa-solid ${layer === 'STREET' ? 'fa-satellite' : 'fa-map'} text-xl`}></i></button>
          <button onClick={() => setIsResetting(true)} className="w-14 h-14 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-2xl transition-all active:scale-90"><i className="fa-solid fa-trash-can text-xl"></i></button>
        </div>

        <div className={`absolute bottom-0 left-0 right-0 z-[150] px-4 pb-6 flex flex-col items-center transition-all duration-500 ${isHudMinimized ? 'translate-y-[calc(100%-60px)] opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}>
          <div className={`w-full max-w-[620px] bg-slate-950/90 backdrop-blur-3xl border border-white/10 rounded-[3.5rem] p-7 shadow-2xl pointer-events-auto flex flex-col gap-6`}>
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Peralatan Survei Lapangan</span>
              <button onClick={() => setIsHudMinimized(true)} className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-slate-400 active:scale-90 transition-all"><i className="fa-solid fa-chevron-down"></i></button>
            </div>
            
            <div className="grid grid-cols-4 gap-3">
              <button onClick={() => setMode('POINT')} className={`h-16 flex flex-col items-center justify-center gap-1 font-black uppercase text-[10px] tracking-widest rounded-[1.5rem] border-2 transition-all ${mode === 'POINT' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-900/50 border-white/5 text-slate-500'}`}><i className="fa-solid fa-map-pin text-xl"></i><span>Titik</span></button>
              <button onClick={() => setMode('AREA')} className={`h-16 flex flex-col items-center justify-center gap-1 font-black uppercase text-[10px] tracking-widest rounded-[1.5rem] border-2 transition-all ${mode === 'AREA' ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-900/50 border-white/5 text-slate-500'}`}><i className="fa-solid fa-draw-polygon text-xl"></i><span>Luas</span></button>
              <button onClick={() => setMode('DISTANCE')} className={`h-16 flex flex-col items-center justify-center gap-1 font-black uppercase text-[10px] tracking-widest rounded-[1.5rem] border-2 transition-all ${mode === 'DISTANCE' ? 'bg-amber-600 border-amber-400 text-white' : 'bg-slate-900/50 border-white/5 text-slate-500'}`}><i className="fa-solid fa-ruler text-xl"></i><span>Jarak</span></button>
              <button onClick={handleUndo} disabled={coords.length === 0} className={`h-16 flex flex-col items-center justify-center gap-1 font-black uppercase text-[10px] tracking-widest rounded-[1.5rem] border-2 bg-slate-900/50 border-white/5 text-slate-400 active:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-all`}><i className="fa-solid fa-rotate-left text-xl"></i><span>Undo</span></button>
            </div>

            {coords.length > 0 && (
              <div className="bg-white/5 rounded-3xl p-4 border border-white/5 min-h-[60px] flex items-center justify-center">
                 {reviewData}
              </div>
            )}

            <button disabled={coords.length === 0} onClick={() => setView('CONFIG')} className="w-full bg-blue-600 text-white font-black h-16 rounded-[2rem] uppercase text-[11px] tracking-[0.4em] shadow-xl active:scale-95 transition-all">Analisis & Terbitkan</button>
          </div>
        </div>

        {isHudMinimized && (
           <button onClick={() => setIsHudMinimized(false)} className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[160] bg-blue-600 text-white px-8 py-4 rounded-full font-black uppercase text-[11px] tracking-widest shadow-2xl animate-bounce pointer-events-auto transition-all"><i className="fa-solid fa-chevron-up mr-3"></i> Buka Alat</button>
        )}
      </div>

      <div id="print-view" className={view === 'PRINT' ? "relative block bg-slate-900 h-full overflow-hidden font-serif text-black" : "hidden"}>
        <div className="absolute top-6 right-6 z-[2000] no-print flex flex-col gap-4">
           <button onClick={() => setView('CONFIG')} title="Kembali" className="w-14 h-14 bg-white text-slate-900 rounded-full flex items-center justify-center shadow-2xl border-2 border-slate-200 active:scale-90 transition-all hover:bg-slate-50 cursor-pointer"><i className="fa-solid fa-chevron-left"></i></button>

           <button onClick={handleExportImage} title="Ekspor Gambar" className="w-14 h-14 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all hover:bg-emerald-500 cursor-pointer"><i className="fa-solid fa-file-image"></i></button>
           <button onClick={handleExportKMZ} title="Unduh KMZ" className="w-14 h-14 bg-slate-800 text-white rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-all hover:bg-black cursor-pointer"><i className="fa-solid fa-earth-americas"></i></button>
         </div>

        <div className="h-full overflow-auto p-4 flex justify-center items-start custom-scrollbar bg-slate-900/50">
          <div 
            id="report-frame"
            className="origin-top bg-white p-8 sm:p-14 border-[12px] border-double border-black min-h-[842px] flex flex-col relative shadow-2xl report-capture"
            style={{ 
              width: '1122px', 
              transform: `scale(${reportScaleUI})`, 
              transformOrigin: 'top center', 
              marginBottom: `${(1 - reportScaleUI) * -842}px` 
            }}
          >
            <div className="flex flex-col sm:flex-row justify-between items-start border-b-[8px] border-black pb-10 mb-12 gap-8">
              <div className="flex-grow">
                <h1 className="text-5xl sm:text-7xl font-black uppercase tracking-tighter leading-none mb-3">{metadata.title}</h1>
                <h2 className="text-base sm:text-xl font-bold text-slate-800 uppercase tracking-[0.6em]">{metadata.subtitle}</h2>
              </div>
              <div className="text-right shrink-0">
                <div className="bg-black text-white px-6 py-2.5 text-[14px] font-black tracking-[0.3em] mb-3 uppercase">VALIDATED GEOSPATIAL ANALYSIS</div>
                <div className="text-[11px] font-mono font-black opacity-70 uppercase tracking-widest text-slate-600">SISTEM PROYTIKSI: WGS 1984</div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row flex-grow gap-12">
              <div className="w-full sm:w-[72%] flex flex-col relative">
                <div className="flex justify-between text-[11px] font-black px-20 mb-3 tracking-widest text-slate-800">{gridLabels.top.map((v, i) => <span key={i}>{v}°E</span>)}</div>
                <div className="flex flex-grow gap-4 relative">
                  <div className="flex flex-col justify-between py-20 text-[10px] font-black w-12 text-slate-800 shrink-0">{gridLabels.left.map((v, i) => <span key={i} className="-rotate-90 origin-center whitespace-nowrap text-right">{v}°N</span>)}</div>
                  <div className="flex-grow border-[8px] border-black relative bg-white overflow-hidden shadow-inner min-h-[400px]">
                    <div id="print-map" className="h-full w-full"></div>
                  </div>
                </div>
              </div>
              
              <div className="w-full sm:w-[28%] flex flex-col gap-10 border-t-8 sm:border-t-0 sm:border-l-[6px] border-black pt-10 sm:pt-0 sm:pl-12 shrink-0">
                <div className="border-[5px] border-black p-2 bg-white flex flex-col items-center shadow-sm">
                  <div className="bg-slate-100 text-[10px] font-black px-3 py-1 mb-2 uppercase tracking-widest w-full text-center border-b border-black">Peta Indeks (Skala 1:50.000)</div>
                  <div className="w-full aspect-[4/3] bg-slate-200 border border-slate-400 relative overflow-hidden">
                    <div id="inset-map" className="h-full w-full"></div>
                  </div>
                </div>

                <div className="border-[5px] border-black p-6 bg-white flex flex-col items-center shadow-sm">
                  <div className="flex items-center justify-around w-full">
                    <div className="flex flex-col items-center shrink-0">
                      <div className="font-black text-2xl mb-1 leading-none">N</div>
                      <div className="relative w-10 h-16 flex items-center justify-center">
                        <div className="w-0 h-0 border-l-[14px] border-l-transparent border-r-[14px] border-r-transparent border-b-[32px] border-b-black"></div>
                        <div className="absolute bottom-0 w-1 h-12 bg-black"></div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 items-center shrink-0 ml-4">
                      <div className="text-[11px] font-black uppercase tracking-widest whitespace-nowrap">SKALA {metadata.scale === 0 ? 'OTOMATIS' : `1 : ${metadata.scale.toLocaleString()}`}</div>
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex h-4 border-[3px] border-black w-24 overflow-hidden shadow-sm">
                          <div className="w-1/2 bg-black"></div>
                          <div className="w-1/2 bg-white"></div>
                        </div>
                        <div className="flex justify-between w-24 text-[7px] font-black">
                          <span>0</span>
                          <span>1 km</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="border-[5px] border-black p-6 bg-white flex-grow shadow-sm overflow-hidden flex flex-col min-h-0">
                  <div className="bg-black text-white text-[11px] font-black px-5 py-2 uppercase tracking-widest text-center mb-6">Legenda Dinamis</div>
                  <div className="space-y-6 overflow-y-auto custom-scrollbar pr-2 flex-grow">
                    {usedSymbols.map((s: any, idx: number) => (
                      <div key={idx} className="flex flex-col gap-2">
                        <div className="flex items-center gap-6">
                          {s.isArea ? (
                             <div className="w-7 h-7 border-[3px] border-black shadow-sm" style={{ backgroundColor: s.color }}></div>
                          ) : s.isDistance ? (
                            <div className="w-7 h-1 border-2 shadow-sm" style={{ backgroundColor: s.color, borderColor: s.color }}></div>
                          ) : (
                            <div className="w-7 h-7 flex items-center justify-center border-[3px] border-black bg-white shadow-sm"><i className={`fa-solid ${s.symbol} text-[12px]`}></i></div>
                          )}
                          <span className="text-[12px] font-black uppercase tracking-tight leading-tight">{s.label}</span>
                        </div>
                        {s.isDistance && (
                          <div className="ml-12 text-[10px] font-mono text-slate-600">
                            <div>Panjang: {s.distance} m</div>
                          </div>
                        )}
                        {s.isArea && (
                          <div className="ml-12 text-[10px] font-mono text-slate-600">
                            <div>Luas: {s.area} ha</div>
                            <div>Keliling: {s.perimeter} m</div>
                          </div>
                        )}
                      </div>
                    ))}
                    {coords.length > 0 && (
                      <div className="pt-4 border-t-2 border-black/10">
                        <span className="text-[10px] font-black opacity-30 block uppercase tracking-[0.2em] mb-2">Daftar Koordinat:</span>
                        <div className="space-y-2">
                           {coords.map((p, i) => (
                             <div key={i} className="text-[10px] font-mono leading-none flex gap-2 text-slate-700">
                               <span className="text-black font-black w-6">P{i+1}:</span>
                               <span>{p.lat.toFixed(6)}, {p.lng.toFixed(6)}</span>
                             </div>
                           ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-14 pt-8 border-t-[6px] border-black flex justify-between items-end text-[14px] font-black uppercase tracking-[0.4em] opacity-90">
              <div className="text-slate-600 font-bold">Petugas Survei: {metadata.surveyor} <span className="mx-5 text-slate-300">|</span> {metadata.date}</div>
              <div className="bg-black text-white px-8 py-3 text-[16px] tracking-[0.8em]">MONTANA GIS v11</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .field-tooltip { background-color: #0f172a !important; color: #fff !important; border: 2px solid #3b82f6 !important; font-size: 9px; font-weight: 900; padding: 4px 8px; border-radius: 8px; }
        .centric-label-icon, .custom-div-icon, .print-div-icon, .print-label-icon { background: none !important; border: none !important; }
        .print-label-icon { z-index: 5000 !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 12px; }
        #map { filter: saturate(1.15) contrast(1.1); }
        
        @media print { 
            @page { size: A4 landscape; margin: 0; }
            .no-print { display: none !important; } 
            body { background: white !important; overflow: visible !important; height: auto !important; } 
            #print-view { padding: 0 !important; margin: 0 !important; background: white !important; overflow: visible !important; display: block !important; height: auto !important; } 
            #print-view > div { margin: 0 !important; box-shadow: none !important; padding: 0 !important; overflow: visible !important; width: 100% !important; background: white !important; }
            #report-frame {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                width: 1122px !important; 
                transform: scale(0.9) !important; 
                transform-origin: top left !important;
                border: 1px solid black !important;
                box-shadow: none !important;
                margin: 0 !important;
                padding: 1cm !important;
                page-break-after: always;
                page-break-inside: avoid;
            }
        }
      `}</style>
    </div>
  );
};

export default App;
