import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { TreeModule } from 'primeng/tree';
import { TreeNode } from 'primeng/api';

interface Boundary {
  min: { x: number; y: number };
  max: { x: number; y: number };
}

interface NodeLookup {
  floor: number;
  node: TreeNode;
  ancestors: TreeNode[];
}

interface SearchResult {
  nodeKey: string;
  floor: number;
  label: string;
  type: string;
  breadcrumb: string;
}

@Component({
  selector: 'app-tree-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TreeModule,
    AccordionModule,
    ButtonModule,
    InputTextModule,
    TagModule
  ],
  templateUrl: './tree-view.component.html',
  styleUrls: ['./tree-view.component.css']
})
export class TreeViewComponent implements OnChanges {
  @Input() data: any;
  @Input() activeFloor: number | null = null;
  @Input() highlightedId: string | null = null;
  @Output() nodeSelected = new EventEmitter<any>();

  floors: any[] = [];
  accordionActiveValue = 0;
  treeDataByFloor: Record<number, TreeNode[]> = {};
  selectedNodes: Record<number, TreeNode | null> = {};
  searchTerm = '';
  searchResults: SearchResult[] = [];

  private nodeLookup = new Map<string, NodeLookup>();
  private floorIndexLookup = new Map<number, number>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data) {
      this.initialiseFloors();
      this.buildTreeData();
      this.recalculateActiveValue();
      this.updateSearchHighlights();
    }

    if ((changes['activeFloor'] && !changes['activeFloor'].firstChange) || changes['data']) {
      this.recalculateActiveValue();
    }

    if (changes['highlightedId']) {
      this.applyExternalHighlight(this.highlightedId);
    }
  }

  onNodeSelect(event: { node: TreeNode }): void {
    if (!event?.node) {
      return;
    }
    const floorNumber = event.node.data?.floor;
    this.clearSelections(typeof floorNumber === 'number' ? floorNumber : undefined);
    if (typeof floorNumber === 'number') {
      this.selectedNodes = {
        ...this.selectedNodes,
        [floorNumber]: event.node
      };
    }
    this.emitSelection(event.node);
  }

  onSearchTermChange(value: string): void {
    this.searchTerm = value;
    this.updateSearchHighlights();
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.navigateToFirstResult();
    }
  }

  onSearchButton(): void {
    this.navigateToFirstResult();
  }

  onResultSelect(result: SearchResult): void {
    this.focusNode(result.nodeKey);
  }

  trackByFloor = (_: number, floor: any) => floor?.floor;

  private initialiseFloors(): void {
    this.floors = Array.isArray(this.data?.floors) ? [...this.data.floors] : [];
    this.floorIndexLookup.clear();
    this.floors.forEach((floor, index) => this.floorIndexLookup.set(floor.floor, index));
  }

  private buildTreeData(): void {
    this.treeDataByFloor = {};
    this.selectedNodes = {};
    this.nodeLookup.clear();

    this.floors.forEach(floor => {
      const nodes = (floor?.zones ?? []).map((zone: any) => this.createZoneNode(floor, zone));
      this.treeDataByFloor[floor.floor] = nodes;
      this.selectedNodes[floor.floor] = null;
    });
  }

  private createZoneNode(floor: any, zone: any): TreeNode {
    const zoneBoundary = this.computeZoneBoundary(zone);
    const zoneCenter = zoneBoundary ? this.computeCenter(zoneBoundary) : null;
    const zoneData = {
      ...zone,
      boundary: zoneBoundary,
      center: zoneCenter,
      type: 'zone',
      floor: floor.floor
    };
    const zoneNode: TreeNode = {
      key: zone.id,
      label: zone.name,
      data: zoneData,
      icon: 'pi pi-map',
      expanded: true,
      children: []
    };
    this.registerNode(zoneNode, floor.floor, []);

    const ancestors = [zoneNode];
    const areaNodes = (zone.areas ?? []).map((area: any) => this.createAreaNode(floor, ancestors, area));
    const roomNodes = (zone.rooms ?? []).map((room: any) => this.createRoomNode(floor, ancestors, room));
    const objectNodes = (zone.objects ?? []).map((obj: any) => this.createObjectNode(floor, ancestors, obj));

    zoneNode.children = [...areaNodes, ...roomNodes, ...objectNodes];
    return zoneNode;
  }

  private createAreaNode(floor: any, ancestors: TreeNode[], area: any): TreeNode {
    const data = {
      ...area,
      type: 'area',
      floor: floor.floor,
      center: this.computeCenter(area.boundary)
    };
    const node: TreeNode = {
      key: area.id,
      label: area.name,
      data,
      icon: 'pi pi-compass',
      expanded: true,
      children: []
    };
    this.registerNode(node, floor.floor, ancestors);
    return node;
  }

  private createRoomNode(floor: any, ancestors: TreeNode[], room: any): TreeNode {
    const data = {
      ...room,
      type: 'room',
      floor: floor.floor,
      center: this.computeCenter(room.boundary)
    };
    const node: TreeNode = {
      key: room.id,
      label: room.name,
      data,
      icon: 'pi pi-home',
      expanded: true,
      children: []
    };
    const roomAncestors = [...ancestors, node];
    this.registerNode(node, floor.floor, ancestors);
    node.children = (room.doors ?? []).map((door: any) => this.createDoorNode(floor, roomAncestors, door));
    return node;
  }

  private createDoorNode(floor: any, ancestors: TreeNode[], door: any): TreeNode {
    const data = {
      ...door,
      type: 'door',
      floor: floor.floor
    };
    const node: TreeNode = {
      key: door.id,
      label: `Door ${door.id}`,
      data,
      icon: 'pi pi-lock-open',
      leaf: true
    };
    this.registerNode(node, floor.floor, ancestors);
    return node;
  }

  private createObjectNode(floor: any, ancestors: TreeNode[], obj: any): TreeNode {
    const data = {
      ...obj,
      type: 'object',
      floor: floor.floor,
      center: this.computeCenter(obj.boundary)
    };
    const node: TreeNode = {
      key: obj.id,
      label: obj.type ?? obj.id,
      data,
      icon: 'pi pi-box',
      leaf: true
    };
    this.registerNode(node, floor.floor, ancestors);
    return node;
  }

  private registerNode(node: TreeNode, floorNumber: number, ancestors: TreeNode[]): void {
    this.nodeLookup.set(node.key as string, {
      floor: floorNumber,
      node,
      ancestors: ancestors.map(a => a)
    });
  }

  private computeZoneBoundary(zone: any): Boundary | null {
    const boundaries: Boundary[] = [];
    (zone.areas ?? []).forEach((area: any) => area.boundary && boundaries.push(area.boundary));
    (zone.rooms ?? []).forEach((room: any) => room.boundary && boundaries.push(room.boundary));
    (zone.objects ?? []).forEach((obj: any) => obj.boundary && boundaries.push(obj.boundary));
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

  private computeCenter(boundary: Boundary | undefined): { x: number; y: number } | null {
    if (!boundary) {
      return null;
    }
    return {
      x: (boundary.min.x + boundary.max.x) / 2,
      y: (boundary.min.y + boundary.max.y) / 2
    };
  }

  private recalculateActiveValue(): void {
    if (!this.floors.length) {
      this.accordionActiveValue = 0;
      return;
    }
    const defaultFloor = this.floors[0]?.floor;
    const targetFloor = this.activeFloor ?? defaultFloor;
    this.accordionActiveValue = targetFloor ?? 0;
  }

  private applyExternalHighlight(nodeKey: string | null): void {
    if (!nodeKey) {
      return;
    }
    const lookup = this.nodeLookup.get(nodeKey);
    if (!lookup) {
      return;
    }
    this.expandAncestors(lookup);
    this.setAccordionActiveByFloor(lookup.floor);
    this.clearSelections(lookup.floor);
    this.selectedNodes = {
      ...this.selectedNodes,
      [lookup.floor]: lookup.node
    };
  }

  private expandAncestors(lookup: NodeLookup): void {
    lookup.ancestors.forEach(ancestor => ancestor.expanded = true);
    lookup.node.expanded = true;
  }

  private setAccordionActiveByFloor(floorNumber: number): void {
    const index = this.floorIndexLookup.get(floorNumber);
    if (index === undefined) {
      return;
    }
    this.accordionActiveValue = floorNumber;
  }

  private emitSelection(node: TreeNode): void {
    if (node?.data) {
      this.nodeSelected.emit(node.data);
    }
  }

  private updateSearchHighlights(): void {
    const term = this.searchTerm.trim().toLowerCase();
    this.searchResults = [];

    this.nodeLookup.forEach((value, key) => {
      const label = (value.node.label ?? '').toString();
      const matches = term.length > 0 && label.toLowerCase().includes(term);
      value.node.styleClass = matches ? 'tree-node__match' : undefined;
      if (matches) {
        this.searchResults.push({
          nodeKey: key,
          floor: value.floor,
          label,
          type: value.node.data?.type ?? 'unknown',
          breadcrumb: this.buildBreadcrumb(value)
        });
      }
    });

    this.searchResults.sort((a, b) => a.label.localeCompare(b.label, 'th'));
  }

  private buildBreadcrumb(lookup: NodeLookup): string {
    const floorName = this.floors.find(f => f.floor === lookup.floor)?.floorName ?? `ชั้น ${lookup.floor}`;
    const ancestorLabels = lookup.ancestors.map(node => node.label).filter(Boolean) as string[];
    return [floorName, ...ancestorLabels].join(' / ');
  }

  private navigateToFirstResult(): void {
    if (!this.searchResults.length) {
      return;
    }
    this.focusNode(this.searchResults[0].nodeKey);
  }

  private focusNode(nodeKey: string): void {
    const lookup = this.nodeLookup.get(nodeKey);
    if (!lookup) {
      return;
    }
    this.expandAncestors(lookup);
    this.setAccordionActiveByFloor(lookup.floor);
    this.clearSelections(lookup.floor);
    this.selectedNodes = {
      ...this.selectedNodes,
      [lookup.floor]: lookup.node
    };
    this.emitSelection(lookup.node);
  }

  private clearSelections(exceptFloor?: number): void {
    const updated: Record<number, TreeNode | null> = { ...this.selectedNodes };
    Object.keys(updated).forEach(key => {
      const floorKey = Number(key);
      if (exceptFloor !== floorKey) {
        updated[floorKey] = null;
      }
    });
    this.selectedNodes = updated;
  }
}
