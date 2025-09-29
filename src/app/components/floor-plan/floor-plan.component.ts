import { Component, ElementRef, ViewChild, AfterViewInit, HostListener } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import floorData from './e12-floor1.json';
import { ButtonModule } from 'primeng/button';
import { CommonModule, DecimalPipe } from '@angular/common';
import { DialogModule } from 'primeng/dialog';

@Component({
  selector: 'app-floor-plan',
  standalone: true,
  imports: [ CommonModule, ButtonModule, DialogModule ],
  providers: [DecimalPipe],
  templateUrl: './floor-plan.component.html',
  styleUrls: ['./floor-plan.component.css'],
})
export class FloorPlanComponent implements AfterViewInit {
  @ViewChild('canvas') private canvasRef!: ElementRef;

  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;

  private wallHeight = 3;
  private wallThickness = 0.2;
  private frustumSize = 60;

  private player!: THREE.Mesh;
  private playerSize = 0.5;
  private playerSpeed = 0.1;
  private wallMeshes: THREE.Mesh[] = [];
  private objectMeshes: THREE.Mesh[] = [];
  private floorMeshes: THREE.Mesh[] = [];
  private doorMeshes: THREE.Mesh[] = [];

  private lockedDoorMaterial!: THREE.MeshStandardMaterial;
  private unlockedDoorMaterial!: THREE.MeshStandardMaterial;

  public currentUserAccessLevel = 0;

  private keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

  public currentView: 'game' | 'top' = 'game';
  public isFullscreen = false;
  public currentZoneId: string | null = null;
  public isDetailDialogVisible = false;
  public selectedObject: { type: string, data: any } | null = null;
  public playerPositionDisplay: string = '';

  private cameraLookAtTarget = new THREE.Vector3();

  constructor(private decimalPipe: DecimalPipe) {}

  ngAfterViewInit(): void {
    this.createScene();
    this.loadFloorPlan();
    this.createPlayer();
    this.startRenderingLoop();
    this.updateDoorMaterials();
    
    // รอให้ DOM ถูกเรนเดอร์ก่อนจะเรียกใช้การปรับขนาด
    setTimeout(() => this.onWindowResize(), 100);
  }

  // --- START OF CODE TO ADD BACK ---

  private updateCameraPosition(): void {
    if (!this.isDetailDialogVisible) {
      this.cameraLookAtTarget.copy(this.player.position);
    }
    
    let targetCameraPos = new THREE.Vector3();
    const cameraLookAt = this.cameraLookAtTarget;
    if (this.currentView === 'game') {
      const offset = new THREE.Vector3(-8, 7, -8);
      targetCameraPos.copy(cameraLookAt).add(offset);
    } else {
      targetCameraPos.set(cameraLookAt.x, 35, cameraLookAt.z);
    }

    const lerpAlpha = 0.05;
    this.camera.position.lerp(targetCameraPos, lerpAlpha);
    this.controls.target.lerp(cameraLookAt, lerpAlpha);
  }

  // --- END OF CODE TO ADD BACK ---

  public simulateAuthentication(level: number): void {
    this.currentUserAccessLevel = level;
    this.updateDoorMaterials();
  }

  private updateDoorMaterials(): void {
    this.doorMeshes.forEach(door => {
      const requiredLevel = door.userData['data'].accessLevel;
      if (this.currentUserAccessLevel >= requiredLevel) {
        door.material = this.unlockedDoorMaterial;
      } else {
        door.material = this.lockedDoorMaterial;
      }
    });
  }

  toggleView(): void {
    this.currentView = this.currentView === 'game' ? 'top' : 'game';
    this.updateCameraPosition(); // This line now works correctly
  }

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    
    // ใช้ ResizeObserver แทนการใช้ setTimeout เพื่อตรวจจับการเปลี่ยนขนาดจริงๆ
    setTimeout(() => {
      this.onWindowResize();
      // บังคับให้มีการคำนวณซ้ำอีกครั้งหลังจากเปลี่ยนเป็น fullscreen เสร็จสมบูรณ์
      setTimeout(() => this.onWindowResize(), 300);
    }, 150);
  }

  public move(event: Event, key: string, state: boolean): void {
    event.preventDefault();
    event.stopPropagation();
    if (key in this.keys) {
      (this.keys as any)[key] = state;
    }
  }

  public disableOrbitControls(event: Event): void {
    event.stopPropagation();
    this.controls.enabled = false;
  }

  public enableOrbitControls(event: Event): void {
    event.stopPropagation();
    this.controls.enabled = true;
  }
  
  public onDialogHide(): void {
    // ไม่ต้อง comment บรรทัดนี้ออก ให้กำหนดค่า zoom เป็น 1.0 เสมอเมื่อปิด dialog
    // this.camera.zoom = 1.0;
    this.camera.updateProjectionMatrix();
    
    // เรียกใช้ onWindowResize เพื่อปรับค่าพารามิเตอร์ของกล้องใหม่ให้สัมพันธ์กับค่า zoom
    this.onWindowResize();
  }

  private get canvas(): HTMLCanvasElement {
    return this.canvasRef.nativeElement;
  }
  
  private createScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xEBF0F5);
    
    // กำหนดขนาด canvas เพื่อคำนวณ aspect ratio
    const canvas = this.canvasRef.nativeElement;
    const aspect = canvas.clientWidth / canvas.clientHeight || 1; // ถ้าค่าเป็น 0 ให้ใช้ 1 แทน
    
    // สร้างกล้องโดยคำนึงถึง aspect ratio
    this.camera = new THREE.OrthographicCamera(
      this.frustumSize * aspect / -2,
      this.frustumSize * aspect / 2,
      this.frustumSize / 2,
      this.frustumSize / -2,
      0.1,
      1000
    );
    this.camera.position.set(-20, 18, -25);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.shadowMap.enabled = true;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, -6);

    this.lockedDoorMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 });
    this.unlockedDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent: true, opacity: 0.3 });
  }

  private loadFloorPlan(): void {
    const floorGroup = new THREE.Group();
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x556677 });
    const objectMaterial = new THREE.MeshStandardMaterial({ color: 0x445566 });

    floorData.areas.forEach(area => {
      const width = area.boundary.max.x - area.boundary.min.x;
      const depth = area.boundary.max.y - area.boundary.min.y;
      const floorGeo = new THREE.PlaneGeometry(width, depth);
      const floorMat = new THREE.MeshStandardMaterial({ color: area.color || 0xffffff });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(area.boundary.min.x + width / 2, 0.01, area.boundary.min.y + depth / 2);
      floor.userData = { type: 'floor', data: area };
      this.floorMeshes.push(floor);
      floorGroup.add(floor);
    });

    if (floorData.walls) {
       floorData.walls.forEach(wall => {
        const start = new THREE.Vector3(wall.start.x, 0, wall.start.y);
        const end = new THREE.Vector3(wall.end.x, 0, wall.end.y);
        const wallMesh = this.buildWallMesh(start, end, this.wallHeight, wallMaterial);
        this.wallMeshes.push(wallMesh);
        floorGroup.add(wallMesh);
      });
    }

    floorData.objects.forEach(obj => {
      const width = obj.boundary.max.x - obj.boundary.min.x;
      const depth = obj.boundary.max.y - obj.boundary.min.y;
      const geo = new THREE.BoxGeometry(width, this.wallHeight, depth);
      const mesh = new THREE.Mesh(geo, objectMaterial);
      mesh.position.set(obj.boundary.min.x + width / 2, this.wallHeight / 2, obj.boundary.min.y + depth / 2);
      mesh.userData = { type: 'object', data: obj };
      this.objectMeshes.push(mesh);
      floorGroup.add(mesh);
    });
    
    if ((floorData as any).doors) {
      (floorData as any).doors.forEach((door: any) => {
        const geo = new THREE.BoxGeometry(door.size.width, this.wallHeight, door.size.depth);
        const mesh = new THREE.Mesh(geo, this.lockedDoorMaterial);
        mesh.position.set(door.center.x, this.wallHeight / 2, door.center.y);
        mesh.userData = { type: 'door', data: door };
        this.doorMeshes.push(mesh);
        floorGroup.add(mesh);
      });
    }

    const gridHelper = new THREE.GridHelper(150, 150);
    this.scene.add(gridHelper);
    this.scene.add(floorGroup);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(-10, 20, -10);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);
  }

  private createPlayer(): void {
    const playerGeometry = new THREE.CylinderGeometry(this.playerSize/2, this.playerSize/2, this.playerSize * 2);
    const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff4444 });
    this.player = new THREE.Mesh(playerGeometry, playerMaterial);
    this.player.position.set(0, this.playerSize, 0);
    this.player.castShadow = true;
    this.scene.add(this.player);
    this.cameraLookAtTarget.copy(this.player.position);
  }

  private updatePlayer(): void {
    if (!this.player) return;
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();
    const rightDirection = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), cameraDirection).normalize();
    const moveVector = new THREE.Vector3(0, 0, 0);
    if (this.keys.ArrowUp) moveVector.add(cameraDirection);
    if (this.keys.ArrowDown) moveVector.sub(cameraDirection);
    if (this.keys.ArrowLeft) moveVector.add(rightDirection);
    if (this.keys.ArrowRight) moveVector.sub(rightDirection);
    if (moveVector.lengthSq() > 0) {
      moveVector.normalize().multiplyScalar(this.playerSpeed);
      const newPosition = this.player.position.clone().add(moveVector);
      if (!this.checkCollision(newPosition)) {
        this.player.position.copy(newPosition);
      }
    }
  }

  private checkCollision(newPosition: THREE.Vector3): boolean {
    const playerBox = new THREE.Box3().setFromCenterAndSize(
      newPosition, new THREE.Vector3(this.playerSize, this.playerSize * 2, this.playerSize)
    );
    for (const wall of this.wallMeshes) {
      if (playerBox.intersectsBox(new THREE.Box3().setFromObject(wall))) return true;
    }
    for (const obj of this.objectMeshes) {
      if (playerBox.intersectsBox(new THREE.Box3().setFromObject(obj))) return true;
    }
    for (const door of this.doorMeshes) {
      if (this.currentUserAccessLevel < door.userData['data'].accessLevel) {
        if (playerBox.intersectsBox(new THREE.Box3().setFromObject(door))) return true;
      }
    }
    return false;
  }

  private checkPlayerZone(): void {
    if (!this.player) return;
    const playerPos = this.player.position;
    let inAnyZone = false;
    for (const area of floorData.areas) {
      const bounds = area.boundary;
      if (playerPos.x >= bounds.min.x && playerPos.x <= bounds.max.x &&
          playerPos.z >= bounds.min.y && playerPos.z <= bounds.max.y) {
        if (this.currentZoneId !== area.id) {
          this.currentZoneId = area.id;
        }
        inAnyZone = true;
        break;
      }
    }
    if (!inAnyZone && this.currentZoneId !== null) {
      this.currentZoneId = null;
    }
  }
  
  @HostListener('window:click', ['$event'])
  onClick(event: MouseEvent) {
    if (event.target !== this.canvasRef.nativeElement) {
      return;
    }
    if (this.isDetailDialogVisible || !this.controls.enabled) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const rect = this.renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, this.camera);
    
    const clickableObjects = [...this.floorMeshes, ...this.doorMeshes, ...this.objectMeshes];
    const intersects = raycaster.intersectObjects(clickableObjects);

    if (intersects.length > 0) {
      const clickedObj = intersects[0].object;
      this.selectedObject = clickedObj.userData as { type: string, data: any };
      this.isDetailDialogVisible = true;
      
      let targetPosition = new THREE.Vector3();
      if (this.selectedObject.type === 'floor') {
          const area = this.selectedObject.data;
          targetPosition.x = (area.boundary.min.x + area.boundary.max.x) / 2;
          targetPosition.z = (area.boundary.min.y + area.boundary.max.y) / 2;
      } else {
          targetPosition.copy(clickedObj.position);
      }

      this.cameraLookAtTarget.copy(targetPosition);
      this.camera.zoom = 1.5;
      this.camera.updateProjectionMatrix();
      
      // สำคัญ: เรียกใช้ onWindowResize หลังจากเปลี่ยนค่า zoom เพื่อปรับค่าพารามิเตอร์ของกล้อง
      this.onWindowResize();
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.code in this.keys) {
      (this.keys as any)[event.code] = true;
      event.preventDefault();
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    if (event.code in this.keys) {
      (this.keys as any)[event.code] = false;
      event.preventDefault();
    }
  }

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

  private startRenderingLoop(): void {
  const render = () => {
    requestAnimationFrame(render);

    const canvas = this.renderer.domElement;
    
    // ป้องกันการคำนวณผิดพลาดหาก canvas ยังไม่มีขนาด
    if (canvas.clientHeight === 0 || !this.camera) {
      return;
    }

    // ตรวจสอบการเปลี่ยนแปลงขนาด
    const needResize = canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight;
    if (needResize) {
      // อัปเดตขนาด renderer และคำนวณ aspect ratio ใหม่
      this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      
      // สำคัญ: คำนวณ aspect ratio จากขนาดที่แท้จริงของ canvas
      const aspect = canvas.width / canvas.height;
      
      // คำนวณระยะการมองเห็นของกล้องจาก frustumSize, zoom และ aspect ratio
      const effectiveFrustumSize = this.frustumSize / this.camera.zoom;
      this.camera.left = effectiveFrustumSize * aspect / -2;
      this.camera.right = effectiveFrustumSize * aspect / 2;
      this.camera.top = effectiveFrustumSize / 2;
      this.camera.bottom = effectiveFrustumSize / -2;
      this.camera.updateProjectionMatrix();
    }
    
    this.updatePlayer();
    this.checkPlayerZone();
    this.updateCameraPosition();
    
    const pos = this.player.position;
    const x = this.decimalPipe.transform(pos.x, '1.1-1');
    const z = this.decimalPipe.transform(pos.z, '1.1-1');
    this.playerPositionDisplay = `X: ${x}, Z: ${z}`;
    
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
  render();
}

@HostListener('window:pointerup')
onGlobalPointerUp(): void {
  if (!this.controls.enabled) {
    this.controls.enabled = true;
  }
}

@HostListener('window:resize')
onWindowResize() {
  if (!this.renderer || !this.camera) return;
  
  const canvas = this.renderer.domElement;
  
  // สำคัญ: ต้องตั้งค่า size ให้ renderer ก่อน
  this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  
  // คำนวณ aspect ratio จากขนาดที่แท้จริงของ canvas หลังจาก setSize
  const aspect = canvas.width / canvas.height;
  
  // คำนวณพื้นที่การมองเห็นโดยคำนึงถึงค่า zoom ของกล้อง
  const effectiveFrustumSize = this.frustumSize / this.camera.zoom;
  
  // กำหนดค่าให้กล้อง
  this.camera.left = effectiveFrustumSize * aspect / -2;
  this.camera.right = effectiveFrustumSize * aspect / 2;
  this.camera.top = effectiveFrustumSize / 2;
  this.camera.bottom = effectiveFrustumSize / -2;
  this.camera.updateProjectionMatrix();
}
}