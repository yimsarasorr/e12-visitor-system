import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { Observable, from, map } from 'rxjs';

export interface RolePermission {
  role: string;
}

export interface Asset {
  id: string;
  name: string;
  type: string;
  floor_number: number;
}

export interface UserProfile {
  id: string;
  full_name: string;
  is_staff: boolean;
  role_label?: string; // สำหรับแสดงใน Dropdown (เช่น "อ.สมใจ (Staff)")
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

  /**
   * 1. ดึงรายชื่อ User ทั้งหมดเพื่อมาใส่ใน Dropdown
   */
  getUsers(): Observable<UserProfile[]> {
    const request = this.supabase
      .from('profiles')
      .select('id, full_name, is_staff')
      .order('is_staff', { ascending: false }); // เอา Staff ขึ้นก่อน

    return from(request).pipe(
      map(response => {
        if (response.error || !response.data) return [];
        return response.data.map((u: any) => ({
          id: u.id,
          full_name: u.full_name,
          is_staff: u.is_staff,
          role_label: `${u.full_name} (${u.is_staff ? 'Staff' : 'Visitor'})`
        }));
      })
    );
  }

  /**
   * 2. ดึง "Permission List" (รายการประตูที่เข้าได้) ของ User คนนี้
   */
  getUserPermissions(userId: string, isStaff: boolean): Observable<string[]> {
    // กรณีที่ 1: ถ้าเป็น Staff ให้เข้าได้ทุกประตู (Admin Mode)
    if (isStaff) {
      return from(this.supabase.from('assets').select('id')).pipe(
        map(res => res.data ? res.data.map((a: any) => a.id) : [])
      );
    }

    // กรณีที่ 2: ถ้าเป็น Visitor ให้เช็คจาก Invitation ที่ Active อยู่
    // (Query: asset_id จาก invitation_access_items ที่ผูกกับ invite ของ user นี้ และยังไม่หมดอายุ)
    const now = new Date().toISOString();
    const request = this.supabase
      .from('invitation_access_items')
      .select('asset_id, invitations!inner(visitor_id, valid_from, valid_until)')
      .eq('invitations.visitor_id', userId)
      .lte('invitations.valid_from', now)   // ต้องเริ่มแล้ว (valid_from <= now)
      .gte('invitations.valid_until', now); // ต้องยังไม่จบ (valid_until >= now)

    return from(request).pipe(
      map(response => {
        if (response.error || !response.data) return [];
        // ดึงเฉพาะ asset_id ออกมาเป็น Array
        return response.data.map((item: any) => item.asset_id);
      })
    );
  }
}