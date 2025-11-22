import { Component, OnInit, Inject, PLATFORM_ID, AfterViewInit, OnDestroy, inject } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { BottomSheetService } from '../../services/bottom-sheet.service';

export interface TargetLocation {
  id: string;
  name: string;
  latlng: [number, number];
  description: string; 
}

@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map-view.component.html', // ✅ ชี้ไปไฟล์ HTML
  styleUrls: ['./map-view.component.css']    // ✅ ชี้ไปไฟล์ CSS
})
export class MapViewComponent implements OnInit, AfterViewInit, OnDestroy {
    private bottomSheetService = inject(BottomSheetService);
    private map: any;
    private L: any;
    
    readonly targets: TargetLocation[] = [
        { name: 'อาคารเรียนรวม 12 ชั้น (E12)', latlng: [13.727792, 100.772519], id: 'E12', description: 'ตึกเรียนรวมคณะวิศวกรรมศาสตร์' },
        { name: 'คณะเทคโนโลยีสารสนเทศ (IT)', latlng: [13.729722, 100.775000], id: 'kmitl_it', description: 'ตึกกระจกริมน้ำ' },
        { name: 'สำนักหอสมุดกลาง (CL)', latlng: [13.726944, 100.775278], id: 'kmitl_cl', description: 'ศูนย์การเรียนรู้และห้องสมุด' },
        { name: 'หอประชุมเจ้าพระยาสุรวงษ์ฯ', latlng: [13.725694, 100.773889], id: 'kmitl_hall', description: 'หอประชุมใหญ่ สจล.' },
        { name: 'โรงพยาบาลพระจอมเกล้าฯ', latlng: [13.723333, 100.776111], id: 'kmitl_hospital', description: 'ศูนย์การแพทย์' }
    ];

    constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

    async ngOnInit() {
        if (!isPlatformBrowser(this.platformId)) return;

        // ส่งรายการตึกไปที่ Bottom Sheet
        this.bottomSheetService.open('building-list', this.targets, 'สถานที่แนะนำ (KMITL)');
        // ❌ ลบบรรทัดนี้ทิ้งครับ! (เพราะมันไปทับคำสั่งของ App Component ที่สั่งให้เป็น Default)
        // this.bottomSheetService.setExpansionState('peek');
    }

    async ngAfterViewInit() {
        if (isPlatformBrowser(this.platformId)) {
            this.L = await import('leaflet');
            setTimeout(() => { this.initMap(); }, 100);
        }
    }

    ngOnDestroy() {
        if (this.map) this.map.remove();
    }

    private initMap() {
        const center: [number, number] = [13.727666, 100.772530];
        this.map = this.L.map('map', { center: center, zoom: 16, zoomControl: false });

        this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        const icon = this.L.icon({
            iconUrl: 'assets/leaflet/marker-icon.png', 
            shadowUrl: 'assets/leaflet/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
        });

        this.targets.forEach(target => {
            const marker = this.L.marker(target.latlng, { icon }).addTo(this.map);
            
            marker.on('click', () => {
                this.map.flyTo(target.latlng, 18, { duration: 1 });
                this.bottomSheetService.open('location-detail', target);
                
                // ✅ แก้ตรงนี้: สั่งให้เด้งขึ้นมาครึ่งจอ (Default)
                this.bottomSheetService.setExpansionState('default');
            });
        });
        
        // เพิ่ม: ถ้าขยับแมพ (ลาก/ซูม) ให้หุบ Sheet ลง
        this.map.on('movestart', () => {
             this.bottomSheetService.setExpansionState('peek');
        });
        
        setTimeout(() => { this.map.invalidateSize(); }, 200);
    }

    public focusOnUser() {
        this.map.setView([13.727666, 100.772530], 16);
    }
}