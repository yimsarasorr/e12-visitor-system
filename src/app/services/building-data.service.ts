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
    // เพิ่มการเช็คตรงนี้: ต้องมีข้อมูล และต้องไม่ว่าง
    if (!assetIds || assetIds.length === 0) {
      return of([]);
    }

    const request = this.supabase
      .from('assets')
      .select(`
        id,
        name,
        type,
        floor_id,   
        floors (
          floor_number
        )
      `)
      .in('id', assetIds); // ตรงนี้ถ้า assetIds ว่าง มันจะ Error 400 แน่นอน แต่เราดักไว้แล้วข้างบน

    return from(request).pipe(
      map(response => {
        if (response.error) {
          // log error แต่คืนค่า array ว่าง เพื่อไม่ให้ app พัง
          console.error('Supabase Error (getAssetDetails):', response.error);
          return [];
        }

        const rows = response.data || [];
        return rows.map((item: any) => {
          // floors อาจมาเป็น object หรือ array หรือ undefined — ป้องกัน crash
          let floorNum = 0;
          const floorsField = item.floors;

          if (Array.isArray(floorsField) && floorsField.length > 0) {
            floorNum = floorsField[0].floor_number ?? 0;
          } else if (floorsField && typeof floorsField === 'object') {
            floorNum = floorsField.floor_number ?? 0;
          } else if (item.floor_number !== undefined && item.floor_number !== null) {
            floorNum = item.floor_number;
          }

          return {
            id: item.id,
            name: item.name,
            type: item.type,
            floor_number: floorNum
          } as Asset;
        });
      }),
      // เพิ่ม catchError เพื่อกันเหนียว
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
