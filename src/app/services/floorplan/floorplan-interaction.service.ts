// src/app/services/floorplan/floorplan-interaction.service.ts
import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import * as THREE from 'three';
import { ThreeSceneService } from './three-scene.service';
import { FloorplanBuilderService } from './floorplan-builder.service';
import { PlayerControlsService } from './player-controls.service';

interface Boundary {
  min: { x: number; y: number };
  max: { x: number; y: number };
}

@Injectable({
  providedIn: 'root'
})
export class FloorplanInteractionService {
  private ngZone = inject(NgZone);
  private threeScene = inject(ThreeSceneService);
  private floorBuilder = inject(FloorplanBuilderService);
  private playerControls = inject(PlayerControlsService);
  
  private floorData: any;
  private raycaster = new THREE.Raycaster();

  // --- State Management (แก้ไข) ---
  public readonly permissionList$ = new BehaviorSubject<string[]>([]); // <--- ตัวใหม่
  public readonly currentZoneId$ = new BehaviorSubject<string | null>(null);
  public readonly isDetailDialogVisible$ = new BehaviorSubject<boolean>(false);
  public readonly selectedObject$ = new BehaviorSubject<{ type: string, data: any } | null>(null);

  /**
   * เริ่มต้น Service และรับข้อมูล floorData
   */
  public initialize(floorData: any): void {
    this.floorData = floorData;
    this.floorBuilder.updateDoorMaterials(this.permissionList$.value); // <--- แก้ไข
  }

  /**
   * (แทนที่) simulateAuthentication ด้วย setPermissionList
   */
  public setPermissionList(allowList: string[]): void {
    this.permissionList$.next(allowList);
    this.floorBuilder.updateDoorMaterials(allowList); // <--- นี่คือที่แก้ Error 4

    // อัปเดต Dialog ถ้าเปิดอยู่
    const currentSelection = this.selectedObject$.value;
    if (this.isDetailDialogVisible$.value && currentSelection?.type === 'door') {
      this.selectedObject$.next(currentSelection); 
    }
  }

  /**
   * ตรวจสอบว่า Player อยู่ในโซนไหน
   */
  public checkPlayerZone(): void {
    if (!this.playerControls.player || !this.floorData.zones) return;
    const playerPos = this.playerControls.player.position;
    let newZoneId: string | null = null;
    for (const zone of this.floorData.zones) {
      if (zone.rooms) {
        for (const room of zone.rooms) {
          if (room.boundary && this.containsPoint(room.boundary, playerPos)) {
            newZoneId = room.id;
            break;
          }
        }
      }
      if (newZoneId) break;
      if (zone.areas) {
        for (const area of zone.areas) {
          if (area.boundary && this.containsPoint(area.boundary, playerPos)) {
            newZoneId = area.id;
            break;
          }
        }
      }
      if (newZoneId) break;
    }
    if (this.currentZoneId$.value !== newZoneId) {
      this.ngZone.run(() => {
        this.currentZoneId$.next(newZoneId);
      });
    }
  }

  /**
   * จัดการการคลิกเมาส์
   */
  public handleMouseClick(event: MouseEvent, cameraLookAtTarget: THREE.Vector3): void {
    if (event.target !== this.threeScene.renderer.domElement || !this.threeScene.controls.enabled) {
      return;
    }
    const mouse = new THREE.Vector2();
    const rect = this.threeScene.renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(mouse, this.threeScene.camera);
    const clickableObjects = [
      ...this.floorBuilder.getFloorMeshes(),
      ...this.floorBuilder.getDoorMeshes(),
      ...this.floorBuilder.getObjectMeshes()
    ];
    const intersects = this.raycaster.intersectObjects(clickableObjects);
    if (intersects.length > 0) {
      const clickedObj = intersects[0].object;
      const payload = clickedObj.userData as { type: string, data: any };
      if (payload?.type && payload.data) {
        this.ngZone.run(() => {
          this.openDetail(payload.type, payload.data, cameraLookAtTarget);
        });
      }
    }
  }

  private openDetail(type: string, data: any, cameraLookAtTarget: THREE.Vector3): void {
    if (data.center) {
      cameraLookAtTarget.set(data.center.x, 0, data.center.y);
    } else if (data.boundary) {
      cameraLookAtTarget.set(
        (data.boundary.min.x + data.boundary.max.x) / 2,
        0,
        (data.boundary.min.y + data.boundary.max.y) / 2
      );
    }
    this.selectedObject$.next({ type, data });
    this.isDetailDialogVisible$.next(true);
  }
  public closeDetail(): void {
    this.isDetailDialogVisible$.next(false);
    this.selectedObject$.next(null);
  }
  private containsPoint(boundary: Boundary, position: THREE.Vector3): boolean {
    return (
      position.x >= boundary.min.x &&
      position.x <= boundary.max.x &&
      position.z >= boundary.min.y &&
      position.z <= boundary.max.y
    );
  }
}