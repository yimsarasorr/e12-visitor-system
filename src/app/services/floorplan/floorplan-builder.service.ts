// src/app/services/floorplan/floorplan-builder.service.ts
import { Injectable } from '@angular/core';
import * as THREE from 'three';

// Interface นี้ย้ายมาจาก component
interface Boundary {
  min: { x: number; y: number };
  max: { x: number; y: number };
}

@Injectable({
  providedIn: 'root'
})
export class FloorplanBuilderService {
  // Constants
  private readonly wallHeight = 3;
  private readonly wallThickness = 0.2;

  // Materials
  private wallMaterial!: THREE.MeshStandardMaterial;
  private objectMaterial!: THREE.MeshStandardMaterial;
  private lockedDoorMaterial!: THREE.MeshStandardMaterial;
  private unlockedDoorMaterial!: THREE.MeshStandardMaterial;

  // Mesh Collections
  private wallMeshes: THREE.Mesh[] = [];
  private objectMeshes: THREE.Mesh[] = [];
  private floorMeshes: THREE.Mesh[] = [];
  private doorMeshes: THREE.Mesh[] = [];
  
  private floorGroup: THREE.Group | null = null;

  constructor() {
    this.initializeMaterials();
  }

  /**
   * สร้าง Materials ที่จะใช้ซ้ำๆ
   */
  private initializeMaterials(): void {
    this.wallMaterial = new THREE.MeshStandardMaterial({ color: 0x556677 });
    this.objectMaterial = new THREE.MeshStandardMaterial({ color: 0x445566 });
    this.lockedDoorMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 });
    this.unlockedDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent: true, opacity: 0.3 });
  }

  /**
   * สร้างโมเดล 3D ทั้งหมดสำหรับชั้น
   * @param floorData ข้อมูล JSON ของชั้น
   * @returns THREE.Group ที่มี Meshes ทั้งหมด
   */
  public buildFloor(floorData: any): THREE.Group {
    this.clearFloor(); // ล้างของเก่าก่อน (ถ้ามี)
    this.floorGroup = new THREE.Group();

    // ( Logic นี้ย้ายมาจาก loadFloorPlan() ใน component )
    if (floorData?.walls) {
      floorData.walls.forEach((wall: any) => {
        const start = new THREE.Vector3(wall.start.x, 0, wall.start.y);
        const end = new THREE.Vector3(wall.end.x, 0, wall.end.y);
        const wallMesh = this.buildWallMesh(start, end, this.wallHeight, this.wallMaterial);
        this.wallMeshes.push(wallMesh);
        this.floorGroup!.add(wallMesh);
      });
    }

    floorData?.zones?.forEach((zone: any) => {
      const zoneBoundaries: Boundary[] = [];

      zone.areas?.forEach((area: any) => {
        const areaWidth = area.boundary.max.x - area.boundary.min.x;
        const areaDepth = area.boundary.max.y - area.boundary.min.y;
        const areaGeo = new THREE.PlaneGeometry(areaWidth, areaDepth);
        const areaMat = new THREE.MeshStandardMaterial({ color: area.color || 0xffffff, side: THREE.DoubleSide });
        const areaFloor = new THREE.Mesh(areaGeo, areaMat);
        areaFloor.rotation.x = -Math.PI / 2;
        areaFloor.position.set(area.boundary.min.x + areaWidth / 2, 0.01, area.boundary.min.y + areaDepth / 2);
        const areaData = { ...area, floor: floorData.floor };
        areaFloor.userData = { type: 'area', data: areaData };
        this.floorMeshes.push(areaFloor);
        this.floorGroup!.add(areaFloor);
        if (area.boundary) {
          zoneBoundaries.push(area.boundary);
        }
      });

      zone.rooms?.forEach((room: any) => {
        const roomWidth = room.boundary.max.x - room.boundary.min.x;
        const roomDepth = room.boundary.max.y - room.boundary.min.y;
        const roomGeo = new THREE.PlaneGeometry(roomWidth, roomDepth);
        const roomMat = new THREE.MeshStandardMaterial({ color: room.color || 0xffffff, side: THREE.DoubleSide });
        const roomFloor = new THREE.Mesh(roomGeo, roomMat);
        roomFloor.rotation.x = -Math.PI / 2;
        roomFloor.position.set(room.boundary.min.x + roomWidth / 2, 0.02, room.boundary.min.y + roomDepth / 2);
        const roomData = { ...room, floor: floorData.floor };
        roomFloor.userData = { type: 'room', data: roomData };
        this.floorMeshes.push(roomFloor);
        this.floorGroup!.add(roomFloor);
        if (room.boundary) {
          zoneBoundaries.push(room.boundary);
        }

        room.doors?.forEach((door: any) => {
          const geo = new THREE.BoxGeometry(door.size.width, this.wallHeight, door.size.depth);
          const mesh = new THREE.Mesh(geo, this.lockedDoorMaterial); // เริ่มต้นด้วย Locked
          mesh.position.set(door.center.x, this.wallHeight / 2, door.center.y);
          const doorData = { ...door, floor: floorData.floor };
          mesh.userData = { type: 'door', data: doorData };
          this.doorMeshes.push(mesh);
          this.floorGroup!.add(mesh);
        });
      });

      zone.objects?.forEach((obj: any) => {
        const width = obj.boundary.max.x - obj.boundary.min.x;
        const depth = obj.boundary.max.y - obj.boundary.min.y;
        const geo = new THREE.BoxGeometry(width, this.wallHeight, depth);
        const mesh = new THREE.Mesh(geo, this.objectMaterial);
        mesh.position.set(obj.boundary.min.x + width / 2, this.wallHeight / 2, obj.boundary.min.y + depth / 2);
        const objectData = { ...obj, floor: floorData.floor };
        mesh.userData = { type: 'object', data: objectData };
        this.objectMeshes.push(mesh);
        this.floorGroup!.add(mesh);
        if (obj.boundary) {
          zoneBoundaries.push(obj.boundary);
        }
      });

      const combined = this.combineBoundaries(zoneBoundaries);
      if (combined) {
        zone.boundary = combined;
        zone.center = {
          x: (combined.min.x + combined.max.x) / 2,
          y: (combined.min.y + combined.max.y) / 2
        };
      }
    });

    return this.floorGroup;
  }

  /**
   * ล้างโมเดลเก่าออกจาก Memory
   */
  public clearFloor(): void {
    if (!this.floorGroup) return;

    this.floorGroup.children.forEach(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    });
    this.floorGroup = null;
    this.wallMeshes = [];
    this.objectMeshes = [];
    this.floorMeshes = [];
    this.doorMeshes = [];
  }

  /**
   * (แก้ไข) อัปเดต Material ของประตูตาม "Allow List" (string[])
   */
  public updateDoorMaterials(allowList: string[]): void { // (รับ string[] ไม่ใช่ number)
    this.doorMeshes.forEach(door => {
      const doorId = door.userData['data'].id;
      // (แก้ไข Logic)
      if (allowList.includes(doorId)) {
        door.material = this.unlockedDoorMaterial;
      } else {
        door.material = this.lockedDoorMaterial;
      }
    });
  }

  // --- Getters สำหรับ Service อื่นเรียกใช้ ---
  public getWallMeshes = (): THREE.Mesh[] => this.wallMeshes;
  public getObjectMeshes = (): THREE.Mesh[] => this.objectMeshes;
  public getDoorMeshes = (): THREE.Mesh[] => this.doorMeshes;
  public getFloorMeshes = (): THREE.Mesh[] => this.floorMeshes;

  /**
   * (ย้ายมาจาก component)
   * สร้าง Mesh กำแพง
   */
  private buildWallMesh(start: THREE.Vector3, end: THREE.Vector3, height: number, material: THREE.Material): THREE.Mesh {
    const distance = start.distanceTo(end);
    if (distance < 0.1) return new THREE.Mesh();
    const geometry = new THREE.BoxGeometry(distance, height, this.wallThickness);
    const mesh = new THREE.Mesh(geometry, material);
    const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mesh.position.set(midPoint.x, height / 2, midPoint.z);
    const direction = new THREE.Vector3().subVectors(end, start);
    mesh.rotation.y = Math.atan2(direction.z, direction.x);
    return mesh;
  }

  /**
   * (ย้ายมาจาก component)
   * รวม Boundary
   */
  private combineBoundaries(boundaries: Boundary[]): Boundary | null {
    if (!boundaries.length) {
      return null;
    }
    return boundaries.reduce((acc, boundary) => ({
      min: {
        x: Math.min(acc.min.x, boundary.min.x),
        y: Math.min(acc.min.y, boundary.min.y)
      },
      max: {
        x: Math.max(acc.max.x, boundary.max.x),
        y: Math.max(acc.max.y, boundary.max.y)
      }
    }));
  }
}