import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
// เพิ่ม 'of' เข้าไปในนี้ครับ
import { Observable, switchMap, map, startWith, of } from 'rxjs'; 
import { FloorplanInteractionService } from '../../services/floorplan/floorplan-interaction.service';
import { BuildingDataService } from '../../services/building-data.service';
import { Asset } from '../../services/auth.service';

@Component({
  selector: 'app-access-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './access-list.component.html',
  styleUrls: ['./access-list.component.css']
})
export class AccessListComponent implements OnInit {
  private interactionService = inject(FloorplanInteractionService);
  private dataService = inject(BuildingDataService); // (inject service)

  public accessibleAssets$!: Observable<Asset[]>;

  ngOnInit(): void {
    // นี่คือ Logic หลักครับ:
    // 1. "ฟัง" permissionList$ (['door_1a', 'door_1b'])
    this.accessibleAssets$ = this.interactionService.permissionList$.pipe(
      startWith([]), // (เริ่มด้วยค่าว่าง)
      // 2. เมื่อ List เปลี่ยน, ให้ไปยิง Supabase (ผ่าน Service) เพื่อเอา "รายละเอียด"
      switchMap(assetIds => {
        if (assetIds.length === 0) {
          return of([]); // ถ้า List ว่าง ก็ไม่ต้องยิง API
        }
        return this.dataService.getAssetDetails(assetIds);
      })
    );
  }
}