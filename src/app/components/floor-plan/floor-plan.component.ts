import { Component, ElementRef, ViewChild, AfterViewInit, HostListener } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import floorData from './e12-floor1.json';

@Component({
  selector: 'app-floor-plan',
  templateUrl: './floor-plan.component.html',
  styleUrls: ['./floor-plan.component.css']
})
export class FloorPlanComponent implements AfterViewInit {

  @ViewChild('canvas') private canvasRef!: ElementRef;

  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;

  private wallHeight = 30;
  private wallThickness = 2;
  private frustumSize = 400;

  private player!: THREE.Mesh;
  private playerSize = 5;
  private playerSpeed = 0.5;
  private wallMeshes: THREE.Mesh[] = [];
  private objectMeshes: THREE.Mesh[] = [];
  
  private keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
  };

  public currentView: 'game' | 'top' = 'game';

  ngAfterViewInit(): void {
    this.createScene();
    this.loadFloorPlan();
    this.createPlayer();
    this.startRenderingLoop();
  }

  private get canvas(): HTMLCanvasElement {
    return this.canvasRef.nativeElement;
  }

  private createScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xEBF0F5);
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera = new THREE.OrthographicCamera(
      this.frustumSize * aspect / -2, 
      this.frustumSize * aspect / 2, 
      this.frustumSize / 2, 
      this.frustumSize / -2, 
      1, 1000
    );
    
    this.camera.position.set(-120, 180, -185);
    
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, -65);
  }
  
  private loadFloorPlan(): void {
    const floorGroup = new THREE.Group();
    
    const wallMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x556677,
      transparent: false,
      opacity: 1.0
    });
    
    const objectMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x445566,
      transparent: false,
      opacity: 1.0
    });

    // สร้างพื้น
    floorData.areas.forEach(area => {
      const width = area.boundary.max.x - area.boundary.min.x;
      const depth = area.boundary.max.y - area.boundary.min.y;
      const floorGeo = new THREE.PlaneGeometry(width, depth);
      const floorMat = new THREE.MeshStandardMaterial({ color: area.color || 0xffffff });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(area.boundary.min.x + width / 2, 0.1, area.boundary.min.y + depth / 2);
      floorGroup.add(floor);
    });

    // สร้างกำแพงจาก walls array
    if ((floorData as any).walls) {
      (floorData as any).walls.forEach((wall: any, index: number) => {
        const start = new THREE.Vector3(wall.start.x, 0, wall.start.y);
        const end = new THREE.Vector3(wall.end.x, 0, wall.end.y);
        const wallMesh = this.buildWallMesh(start, end, this.wallHeight, wallMaterial);
        this.wallMeshes.push(wallMesh); // เก็บ wall mesh สำหรับ collision
        floorGroup.add(wallMesh);
      });
    }

    // สร้าง object (ลิฟต์, ห้องน้ำ, บันได) จาก json จ้า
    floorData.objects.forEach(obj => {
      const width = obj.boundary.max.x - obj.boundary.min.x;
      const depth = obj.boundary.max.y - obj.boundary.min.y;
      const geo = new THREE.BoxGeometry(width, this.wallHeight, depth);
      const mesh = new THREE.Mesh(geo, objectMaterial);
      mesh.position.set(obj.boundary.min.x + width/2, this.wallHeight/2, obj.boundary.min.y + depth/2);
      this.objectMeshes.push(mesh); // เก็บ object mesh สำหรับ collision
      floorGroup.add(mesh);
    });

    // Grid และแสง
    const gridHelper = new THREE.GridHelper(600, 60);
    this.scene.add(gridHelper);
    this.scene.add(floorGroup);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(-100, 200, -100);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(100, 150, 100);
    this.scene.add(directionalLight2);
  }

  private createPlayer(): void {
    const playerGeometry = new THREE.CylinderGeometry(this.playerSize/2, this.playerSize/2, this.playerSize);
    const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff4444 });
    this.player = new THREE.Mesh(playerGeometry, playerMaterial);
    this.player.position.set(0, this.playerSize/2, 0); // วางใน lobby
    this.player.castShadow = true;
    this.scene.add(this.player);
  }

  private updatePlayer(): void {
    if (!this.player) return;

    const moveVector = new THREE.Vector3(0, 0, 0);
    
    // ทิศทาง
    if (this.keys.ArrowUp) moveVector.z += this.playerSpeed;
    if (this.keys.ArrowDown) moveVector.z -= this.playerSpeed;
    if (this.keys.ArrowLeft) moveVector.x -= this.playerSpeed;
    if (this.keys.ArrowRight) moveVector.x += this.playerSpeed;

    if (moveVector.length() > 0) {
      // คำนวณตำแหน่งใหม่
      const newPosition = this.player.position.clone().add(moveVector);
      
      // ตรวจสอบ collision ก่อนเคลื่อนที่
      if (!this.checkCollision(newPosition)) {
        this.player.position.copy(newPosition);
        
        // อัพเดทกล้องให้ตาม player
        if (this.currentView === 'game') {
          this.controls.target.set(this.player.position.x, 0, this.player.position.z);
        }
      }
    }
  }

  private checkCollision(newPosition: THREE.Vector3): boolean {
    const playerBox = new THREE.Box3().setFromCenterAndSize(
      newPosition,
      new THREE.Vector3(this.playerSize, this.playerSize, this.playerSize)
    );

    // ตรวจสอบชนกับกำแพง
    for (const wall of this.wallMeshes) {
      const wallBox = new THREE.Box3().setFromObject(wall);
      if (playerBox.intersectsBox(wallBox)) {
        return true; // มี collision
      }
    }

    // ตรวจสอบชนกับ objects (ลิฟต์, ห้องน้ำ, บันได)
    for (const obj of this.objectMeshes) {
      const objBox = new THREE.Box3().setFromObject(obj);
      if (playerBox.intersectsBox(objBox)) {
        return true; // มี collision
      }
    }

    return false; // ไม่มี collision
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

  private buildWallMesh(start: THREE.Vector3, end: THREE.Vector3, height: number, material: THREE.Material, yOffset: number = 0): THREE.Mesh {
    const distance = start.distanceTo(end);
    
    if (distance < 0.1) {
      console.warn('Wall distance too small, skipping');
      return new THREE.Mesh();
    }
    
    const geometry = new THREE.BoxGeometry(distance, height, this.wallThickness);
    const mesh = new THREE.Mesh(geometry, material);
    
    const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mesh.position.set(midPoint.x, height / 2 + yOffset, midPoint.z);
    
    const direction = new THREE.Vector3().subVectors(end, start).normalize();
    const angle = Math.atan2(direction.z, direction.x);
    mesh.rotation.y = angle;
    
    return mesh;
  }

  private startRenderingLoop(): void {
    const render = () => {
      requestAnimationFrame(render);
      
      this.updatePlayer();
      
      if (this.currentView === 'game') {
        const cameraTargetPosition = new THREE.Vector3(
          this.player.position.x - 80,
          120,
          this.player.position.z - 80
        );
        
        this.camera.position.copy(cameraTargetPosition);
        
      } else { 
        this.camera.position.set(0, 300, 0);
        this.controls.target.set(0, 0, 0);
      }
      
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    render();
  }

  toggleView(): void {
    this.currentView = this.currentView === 'game' ? 'top' : 'game';
    
    if (this.currentView === 'game') {
      this.camera.position.set(
        this.player.position.x - 80, 
        120, 
        this.player.position.z - 80
      );
      this.controls.target.set(this.player.position.x, 0, this.player.position.z);
    } else {
      this.camera.position.set(0, 300, 0);
      this.controls.target.set(0, 0, 0);
    }
    
    this.controls.update();
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize(event: Event) {
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera.left = this.frustumSize * aspect / -2;
    this.camera.right = this.frustumSize * aspect / 2;
    this.camera.top = this.frustumSize / 2;
    this.camera.bottom = this.frustumSize / -2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
  }
}