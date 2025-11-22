import { Component, OnInit, PLATFORM_ID, Inject, OnDestroy, AfterViewInit, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
// Import Service ของคุณ
import { BottomSheetService } from '../../services/bottom-sheet.service';

interface TargetLocation {
  name: string;
  latlng: [number, number];
  id: string;
  description?: string; 
}

interface SearchResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  isLocal?: boolean;
  id?: string; 
}

@Component({
  selector: 'app-map-view', // ✅ แก้ Selector ให้ตรงกับ App Component
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map-view.component.html',
  styleUrls: ['./map-view.component.css']
})
export class MapViewComponent implements OnInit, OnDestroy, AfterViewInit {
    // Inject Service กลาง
    private bottomSheetService = inject(BottomSheetService);
    
    private map: any;
    private userMarker: any;
    private searchMarker: any; 
    private ngeohash: any;
    private geoHashBounds: any;
    private updateInterval: any;
    private L: any; // เก็บ Leaflet Instance
    
    isSheetExpanded: boolean = false; 
    isSearching: boolean = false; 
    showSuggestions: boolean = false;
    currentSearchQuery: string = '';
    searchError: string | null = null;
    searchResults: SearchResult[] = [];
    selectedLocation: TargetLocation | null = null;

    private searchSubject = new Subject<string>();
    private searchSubscription: Subscription | null = null;

    readonly targets: TargetLocation[] = [
        { name: 'อาคารเรียนรวม 12 ชั้น (E12)', latlng: [13.727549228597026, 100.77255458246205], id: 'kmitl_e12', description: 'ตึกเรียนรวมคณะวิศวกรรมศาสตร์' },
        { name: 'คณะเทคโนโลยีสารสนเทศ (IT)', latlng: [13.73110775313755, 100.78104593482931], id: 'kmitl_it', description: 'ตึกกระจกริมน้ำ' },
        { name: 'สำนักหอสมุดกลาง (KLLC)', latlng: [13.727624181555798, 100.77868310812387], id: 'kmitl_cl', description: 'ศูนย์การเรียนรู้และห้องสมุด' },
        { name: 'สำนักงานอธิการบดี', latlng: [13.731022304549109, 100.77766077763981], id: 'kmitl_president', description: 'ตึกกรมหลวงนราธิวาสราชนครินทร์' },
        { name: 'หอประชุมเจ้าพระยาสุรวงษ์ฯ', latlng: [13.72664371810848, 100.7792703321349], id: 'kmitl_hall', description: 'หอประชุมใหญ่ สจล.' },
        { name: 'คณะสถาปัตยกรรมศาสตร์', latlng: [13.725334824782951, 100.77746353790184], id: 'kmitl_arch', description: 'ริมทางรถไฟ' },
        { name: 'รพ.พระจอมเกล้าเจ้าคุณทหาร', latlng: [13.732349221023322, 100.789629628721], id: 'kmitl_hospital', description: 'ศูนย์การแพทย์' },
        { name: 'อาคารพระเทพฯ (ตึกปฏิบัติการ)', latlng: [13.730024512451434, 100.77683801915526], id: 'kmitl_eng_labs', description: 'ศูนย์ปฏิบัติการวิศวกรรม' },
        { name: 'วิทยาลัยนวัตกรรมการผลิตขั้นสูง', latlng: [13.730062563193098, 100.77542709470409], id: 'kmitl_60th', description: 'อาคารเรียนรวม' }
    ];
    
    userLat: number | null = null;
    userLng: number | null = null;
    userGeoHash: string | null = null;
    errorMessage: string | null = null; 
    
    constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

    // --- Interactions ---

    public toggleSheet(): void {
        // ใช้ Service แทนการ toggle ตัวแปร local
        // this.isSheetExpanded = !this.isSheetExpanded; 
    }

    public async onLocationSelect(target: TargetLocation): Promise<void> {
        this.selectedLocation = target;
        
        if (this.map) {
            this.map.flyTo(target.latlng, 18, { duration: 1.5 });
            
            const isSavedLocation = this.targets.some(t => t.id === target.id);
            
            if (this.searchMarker) {
                this.map.removeLayer(this.searchMarker);
                this.searchMarker = undefined;
            }

            if (!isSavedLocation) {
                this.addSearchMarker(this.L, target.latlng, target.name);
            }

            // ✅ แจ้ง Service ให้เปิด Sheet รายละเอียด
            this.bottomSheetService.open('location-detail', target);
            this.bottomSheetService.setExpansionState('default');
        }
    }

    public clearSelection(): void {
        this.selectedLocation = null;
        // ✅ สั่ง Service กลับไปหน้า List
        this.bottomSheetService.open('building-list', this.targets, 'สถานที่แนะนำ (KMITL)');
        this.bottomSheetService.setExpansionState('peek');
    }

    public getGoogleMapsLink(lat: number, lng: number): string {
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }

    // --- Search Logic ---

    public onSearchInput(query: string): void {
        this.currentSearchQuery = query;
        this.showSuggestions = true;
        if (!query || query.length < 2) {
            this.searchResults = [];
            return;
        }
        this.searchSubject.next(query);
    }

    public clearSearch(): void {
        this.currentSearchQuery = '';
        this.searchResults = [];
        this.showSuggestions = false;
        this.isSearching = false;
        this.searchError = null;
        if (this.searchMarker && this.map) {
            this.map.removeLayer(this.searchMarker);
        }
    }

    public async selectSearchResult(result: SearchResult): Promise<void> {
        this.showSuggestions = false;
        this.currentSearchQuery = result.name;
        
        const targetId = result.id || 'search_result_' + Date.now();

        const target: TargetLocation = {
            name: result.name,
            latlng: [result.lat, result.lng],
            id: targetId,
            description: result.address
        };
        
        this.onLocationSelect(target);
    }

    private performSearch(query: string): void {
        this.isSearching = true;
        this.searchError = null;

        const lowerQuery = query.toLowerCase();
        const localMatches: SearchResult[] = this.targets
            .filter(target => target.name.toLowerCase().includes(lowerQuery))
            .map(target => ({
                name: target.name,
                address: 'KMITL',
                lat: target.latlng[0],
                lng: target.latlng[1],
                isLocal: true,
                id: target.id 
            }));
        
        this.searchResults = [...localMatches];
        
        // ... (Gemini Logic เดิมของเพื่อน) ...
        
        this.isSearching = false; // Mock finish
    }

    private addSearchMarker(L: any, location: [number, number], name: string): void {
        const icon = L.icon({
            iconUrl: 'assets/leaflet/marker-icon.png', 
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34]
        });

        this.searchMarker = L.marker(location, { icon: icon })
            .addTo(this.map)
            .bindPopup(`
                <div style="text-align:center; font-family: 'Sarabun', sans-serif;">
                    <b>${name}</b>
                </div>
            `)
            .openPopup();
    }

    // --- Lifecycle ---

    ngOnInit(): void {
        this.searchSubscription = this.searchSubject.pipe(
            debounceTime(500),
            distinctUntilChanged()
        ).subscribe(query => this.performSearch(query));

        // ✅ ส่งข้อมูลตึกให้ Bottom Sheet ทันทีที่เปิด
        this.bottomSheetService.open('building-list', this.targets, 'สถานที่แนะนำ (KMITL)');
        // ❌ ไม่ต้องสั่ง setExpansionState('peek') ที่นี่ ปล่อยให้ App จัดการ (หรือสั่งก็ได้ถ้าต้องการเริ่มที่ peek)
    }

    async ngAfterViewInit(): Promise<void> {
        if (isPlatformBrowser(this.platformId)) {
            
            // 🏆 1. CRITICAL FIX: Import Leaflet ให้ถูกต้องสำหรับ Prod
            const LeafletModule = await import('leaflet');
            this.L = (LeafletModule as any).default || LeafletModule; 
            
            this.ngeohash = await import('ngeohash');

            // Fix Icons
            const iconRetinaUrl = 'assets/leaflet/marker-icon-2x.png';
            const iconUrl = 'assets/leaflet/marker-icon.png';
            const shadowUrl = 'assets/leaflet/marker-shadow.png';
            
            // ลบ if (this.L.Icon) ออก เพื่อป้องกัน TS error
            const DefaultIcon = this.L.Icon.extend({
                options: { iconUrl, iconRetinaUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] }
            });
            this.L.Marker.prototype.options.icon = new (DefaultIcon as any)(); 

            this.initMap(this.L);
            this.startLocationInterval(this.L);
        }
    }

    ngOnDestroy(): void {
        if (this.updateInterval) clearInterval(this.updateInterval);
        if (this.searchSubscription) this.searchSubscription.unsubscribe();
        if (this.map) this.map.remove(); 
    }

    private initMap(L: any) {
        const mapElement = document.getElementById('map');
        if (!mapElement) {
            console.error('Map container not found!');
            return; 
        }
        
        const defaultCenter: [number, number] = [13.72766661420566, 100.77253069896474];
        
        if (this.map) {
            this.map.remove();
            this.map = null; 
        }

        this.map = L.map('map', { center: defaultCenter, zoom: 16, zoomControl: false }); // Zoom 16 ดีกว่า
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);
        
        // Add Markers
        const targetIcon = L.icon({
            iconUrl: 'assets/leaflet/marker-icon.png',
            shadowUrl: 'assets/leaflet/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
        });
        
        this.targets.forEach(target => {
            const marker = L.marker(target.latlng, { icon: targetIcon }).addTo(this.map);
            
            // ✅ 2. แก้ไขคลิก Marker: ใส่ stopPropagation และสั่งเด้ง
            marker.on('click', (e: any) => {
                L.DomEvent.stopPropagation(e.originalEvent); // หยุด Event ทะลุ
                this.onLocationSelect(target);
            });
        });
        
        // Move Start -> หุบ Sheet
        this.map.on('movestart', () => {
             this.bottomSheetService.setExpansionState('peek');
        });

        // Force Redraw
        setTimeout(() => { 
            if (this.map) {
                this.map.invalidateSize(); 
            }
        }, 500);
    }

    public focusOnUser(): void {
        if (this.map && this.userLat) {
            this.map.flyTo([this.userLat, this.userLng], 18);
            this.selectedLocation = null;
            this.bottomSheetService.setExpansionState('peek');
        }
    }

    private startLocationInterval(L: any) {
        // ... (Logic เดิมของเพื่อน) ...
        // (Copy Logic เดิมมาใส่ได้เลย หรือใช้จากไฟล์ที่แนบมาก็ทำงานได้)
        const updateLocation = () => {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(pos => {
                this.userLat = pos.coords.latitude;
                this.userLng = pos.coords.longitude;
                // GeoHash logic (ถ้าใช้)
                if (this.ngeohash) {
                     this.userGeoHash = this.ngeohash.encode(this.userLat, this.userLng, 8);
                }
                
                if (!this.userMarker && this.map) { 
                    const userIcon = L.icon({
                        // ใช้ SVG Data URI หรือ path รูป user
                        iconUrl: 'assets/leaflet/marker-icon.png', 
                        iconSize: [25, 41], iconAnchor: [12, 41]
                    });
                    this.userMarker = L.marker([this.userLat, this.userLng], { icon: userIcon }).addTo(this.map);
                } else if (this.userMarker) {
                    this.userMarker.setLatLng([this.userLat, this.userLng]);
                }

            }, err => {
                this.errorMessage = "Cannot get location";
            }, { enableHighAccuracy: true });
        };
        updateLocation();
        this.updateInterval = setInterval(updateLocation, 5000); 
    }
}