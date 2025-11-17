import { Injectable, inject } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { Observable, from, map } from 'rxjs';

export interface RolePermission {
  role: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  /**
   * ดึง Role จากตาราง 'roles'
   */
  getRoles(): Observable<RolePermission[]> {
    const request = this.supabase
      .from('roles')
      .select('role');
      
    return from(request).pipe(
      map(response => response.data || [])
    );
  }

  /**
   * ดึง "Allow List" (รายการ asset_id ที่เปิดได้) จาก Role ที่เลือก
   */
  getPermissionList(role: string): Observable<string[]> {
    const request = this.supabase
      .from('access_rules')
      .select('asset_id')
      .eq('role', role);

    return from(request).pipe(
      map(response => {
        if (!response.data) return [];
        return response.data.map((item: any) => item.asset_id);
      })
    );
  }
}