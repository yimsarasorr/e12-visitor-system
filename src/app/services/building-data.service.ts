import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import fallbackBuilding from '../components/floor-plan/e12-floor1.json';

export interface BuildingData {
  buildingId: string;
  buildingName?: string;
  floors: any[];
}

const FALLBACK_BUILDING = fallbackBuilding as BuildingData;

@Injectable({ providedIn: 'root' })
export class BuildingDataService {
  private readonly http = inject(HttpClient);

  getBuilding(buildingId: string): Observable<BuildingData> {
    return this.http.get<BuildingData>(`/api/buildings/${buildingId}`).pipe(
      map(response => ({
        ...FALLBACK_BUILDING,
        ...response,
        floors: response?.floors?.length ? response.floors : FALLBACK_BUILDING.floors
      })),
      catchError(() => of(FALLBACK_BUILDING))
    );
  }

  getFallback(): BuildingData {
    return FALLBACK_BUILDING;
  }
}
