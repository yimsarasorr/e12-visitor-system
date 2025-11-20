import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, switchMap, map, startWith, of } from 'rxjs'; // *อย่าลืม of*
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
  private dataService = inject(BuildingDataService);

  public accessibleAssets$!: Observable<Asset[]>;

  ngOnInit(): void {
    this.accessibleAssets$ = this.interactionService.permissionList$.pipe(
      startWith([]),
      switchMap(assetIds => {
        // กรองค่าที่เป็น null/undefined/empty ออกก่อนส่ง
        const cleanIds = (assetIds || []).filter(id => !!id);

        if (cleanIds.length === 0) {
          return of([]);
        }
        return this.dataService.getAssetDetails(cleanIds);
      })
    );
  }
}