import { Component, OnInit, Inject, PLATFORM_ID, AfterViewInit, OnDestroy, Output, EventEmitter, Input } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { BuildingViewComponent } from '../building-view/building-view.component';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

// Interface สำหรับพิกัดตึก
export interface LocationTarget {
  id: string;
  name: string;
  latlng: [number, number];
  description: string;
  has3DModel?: boolean; 
}

@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [CommonModule, BuildingViewComponent],
  templateUrl: './map-view.component.html',
  styleUrls: ['./map-view.component.css']
})
export class MapViewComponent implements OnInit, AfterViewInit, OnDestroy {
  @Output() buildingSelected = new EventEmitter<string>();
  @Input() buildingData: any; 

  private map: any;
  private L: any;
  private ngeohash: any; // เก็บ lib ngeohash
  
  private userMarker: any;
  private updateInterval: any;

  // User Location Data
  userLat: number | null = null;
  userLng: number | null = null;
  userGeoHash: string | null = null;

  // UI State
  isSheetExpanded = false;
  selectedLocation: LocationTarget | null = null;
  
  // ข้อมูลตึก (Mockup)
  readonly targets: LocationTarget[] = [
    { 
      name: 'อาคารเรียนรวม 12 ชั้น (E12)', 
      latlng: [13.727792, 100.772519], // พิกัดจริงจากโค้ดเพื่อน
      id: 'E12', 
      description: 'ศูนย์รวมห้องปฏิบัติการวิศวกรรม',
      has3DModel: true 
    },
    { name: 'คณะเทคโนโลยีสารสนเทศ (IT)', latlng: [13.729722, 100.775000], id: 'kmitl_it', description: 'ตึกกระจกริมน้ำ' },
    { name: 'หอสมุดกลาง (CL)', latlng: [13.726944, 100.775278], id: 'kmitl_cl', description: 'ศูนย์การเรียนรู้' }
  ];

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  async ngOnInit() {
    // (Search Logic ถ้ามี ใส่ตรงนี้ได้)
  }

  async ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      // Dynamic Import เพื่อเลี่ยงปัญหา SSR
      this.L = await import('leaflet');
      this.ngeohash = await import('ngeohash'); // Import Geohash
      
      this.initMap();
      this.startLocationInterval(); // เริ่มจับพิกัดและคำนวณ Geohash
    }
  }

  ngOnDestroy() {
    if (this.updateInterval) clearInterval(this.updateInterval);
    if (this.map) this.map.remove();
  }

  private initMap(): void {
    // ใช้ Center เริ่มต้นเป็น E12
    const center: [number, number] = [13.727792, 100.772519];
    this.map = this.L.map('map', {
      center: center,
      zoom: 16,
      zoomControl: false
    });

    this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(this.map);

    // ปักหมุดตึกต่างๆ
    const targetIcon = this.L.icon({
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', // ใช้ Icon สีแดง
        iconSize: [32, 32], iconAnchor: [16, 32]
    });

    this.targets.forEach(target => {
      const marker = this.L.marker(target.latlng, { icon: targetIcon }).addTo(this.map);
      marker.on('click', () => {
         this.selectLocation(target);
         this.map.flyTo(target.latlng, 18, { duration: 1 });
      });
    });
  }

  private startLocationInterval() {
    const updateLocation = () => {
        if (!navigator.geolocation) return;
        
        navigator.geolocation.getCurrentPosition(pos => {
            this.userLat = pos.coords.latitude;
            this.userLng = pos.coords.longitude;
            
            // *** GEOHASH LOGIC ***
            if (this.ngeohash) {
                // encode(lat, lng, precision) -> precision 8 คือละเอียดระดับ +/- 19 เมตร
                this.userGeoHash = this.ngeohash.encode(this.userLat, this.userLng, 8);
                console.log('Current Geohash:', this.userGeoHash); // เช็คใน Console ได้เลย
            }
            
            // Update Marker บนแผนที่
            if (!this.userMarker) {
                const userIcon = this.L.icon({
                    iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234285F4" width="48px" height="48px"><circle cx="12" cy="12" r="8" stroke="white" stroke-width="2"/></svg>',
                    iconSize: [24, 24], iconAnchor: [12, 12]
                });
                this.userMarker = this.L.marker([this.userLat, this.userLng], { icon: userIcon }).addTo(this.map);
            } else {
                this.userMarker.setLatLng([this.userLat, this.userLng]);
            }

        }, err => {
            console.error("Cannot get location", err);
        }, { enableHighAccuracy: true });
    };

    updateLocation();
    this.updateInterval = setInterval(updateLocation, 5000); // อัปเดตทุก 5 วิ
  }

  selectLocation(target: LocationTarget) {
    this.selectedLocation = target;
    this.isSheetExpanded = true;
  }

  enterBuilding() {
    if (this.selectedLocation) {
      this.buildingSelected.emit(this.selectedLocation.id);
    }
  }
}