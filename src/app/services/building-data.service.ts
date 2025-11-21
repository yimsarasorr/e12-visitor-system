import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, from } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Asset } from './auth.service'; // Import Asset interface
import { createClient, SupabaseClient } from '@supabase/supabase-js'; // Import Supabase
import { environment } from '../../environments/environment'; // Import environment

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
  private supabase: SupabaseClient; // เพิ่ม Supabase Client

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey); // เพิ่ม
  }

  /**
   * 1. ดึงข้อมูลอาคาร (สำหรับการดูแผนผัง)
   */
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

  /**
   * 2. ดึงรายละเอียด Asset (สำหรับ Access List)
   */
  getAssetDetails(assetIds: string[]): Observable<Asset[]> {
    if (!assetIds || assetIds.length === 0) {
      return of([]);
    }

    const request = this.supabase
      .from('assets')
      .select(`
        id,
        name,
        type,
        floors ( floor_number )
      `)
      .in('id', assetIds);

    return from(request).pipe(
      map(response => {
        if (response.error) {
          console.error('Supabase Error (getAssetDetails):', response.error);
          return [];
        }

        const rows = response.data || [];
        return rows.map((item: any) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          // ใช้ property floors โดยตรง (fallback เป็น 0)
          floor_number: item.floors?.floor_number || 0
        } as Asset));
      }),
      catchError(err => {
        console.error('Catch Error in getAssetDetails:', err);
        return of([]);
      })
    );
  }

  getFallback(): BuildingData {
    return FALLBACK_BUILDING;
  }
}
