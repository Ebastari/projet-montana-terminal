
export type DrawingMode = 'NONE' | 'DISTANCE' | 'AREA' | 'POINT';
export type MapLayer = 'STREET' | 'SATELLITE';

export interface Coordinate {
  lat: number;
  lng: number;
  label?: string;
  symbol?: string; // FontAwesome icon class
  color?: string;
}

export interface BoundaryStyle {
  color: string;
  fillColor: string;
  label: string;
}

export interface ReportMetadata {
  title: string;
  subtitle: string;
  surveyor: string;
  scale: number;
  date: string;
  legendOverrides?: Record<number, string>; // ID titik -> Nama kustom
}

export interface AppState {
  view: 'FIELD' | 'CONFIG' | 'PRINT';
  drawingMode: DrawingMode;
  coords: Coordinate[];
  layer: MapLayer;
  metadata: ReportMetadata;
}
