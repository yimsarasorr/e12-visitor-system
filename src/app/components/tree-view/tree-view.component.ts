import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Tree, TreeModule } from 'primeng/tree';
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
  imports: [CommonModule, FormsModule, TreeModule],
  templateUrl: './tree-view.component.html',
  styleUrls: ['./tree-view.component.css']
})
export class TreeViewComponent implements OnChanges {
  @Input() data: any;
  @Input() activeFloor: number | null = null;
  @Input() highlightedId: string | null = null;
  @Output() nodeSelected = new EventEmitter<any>();

  treeData: TreeNode[] = [];
  selectedNode: TreeNode | null = null;
  searchTerm = '';
  notFound = false;

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
    if (changes['highlightedId'] && this.treeData.length > 0) {
      this.notFound = false;
      const found = this.expandAndSelectNodeByKey(this.treeData, this.highlightedId);
      if (!found) {
        this.selectNode(null);
      }
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

  private transformDataToTreeNodes(buildingData: any): TreeNode[] {
    return [
      {
        key: buildingData.buildingId,
        label: buildingData.buildingName,
        expanded: true,
        children: buildingData.floors.map((floor: any) => ({
          key: `floor_${floor.floor}`,
          label: floor.floorName,
          data: { type: 'floor', floor: floor.floor },
          expanded: true,
          children: floor.zones.map((zone: any) => ({
            key: zone.id,
            label: zone.name,
            data: { type: 'zone', floor: floor.floor, ...zone },
            children: [
              ...zone.areas.map((area: any) => ({
                key: area.id,
                label: area.name,
                data: { type: 'area', floor: floor.floor, ...area },
                icon: 'pi pi-map-marker'
              })),
              ...zone.rooms.map((room: any) => ({
                key: room.id,
                label: room.name,
                data: { type: 'room', floor: floor.floor, ...room },
                children: room.doors.map((door: any) => ({
                  key: door.id,
                  label: `Door: ${door.id}`,
                  data: { type: 'door', floor: floor.floor, ...door },
                  icon: 'pi pi-lock'
                }))
              }))
            ]
          }))
        }))
      }
    }));
  }

  private computeCenter(boundary: Boundary | undefined): { x: number; y: number } | null {
    if (!boundary) {
      return null;
  onNodeSelect(event: {node: TreeNode}) {
    if (event.node && event.node.data) {
      this.nodeSelected.emit(event.node.data);
    }
    return {
      x: (boundary.min.x + boundary.max.x) / 2,
      y: (boundary.min.y + boundary.max.y) / 2
    };
  }

  onSearch(): void {
    this.notFound = false;
    const trimmed = this.searchTerm.trim();
    if (!trimmed) {
      return;
    }
    const match = this.findNodeByLabel(this.treeData, trimmed.toLowerCase());
    if (match) {
      this.selectNode(match);
      this.expandParents(this.treeData, match);
      this.nodeSelected.emit(match.data);
    } else {
      this.notFound = true;
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.onSearch();
    }
  }

  private expandAndSelectNodeByKey(nodes: TreeNode[], key: string | null): boolean {
    if (!key) {
      this.selectNode(null);
      return false;
    }
    for (const node of nodes) {
      if (node.key === key) {
        this.selectNode(node);
        this.expandParents(this.treeData, node);
        return true;
      }
      if (node.children) {
        const found = this.expandAndSelectNodeByKey(node.children, key);
        if (found) {
          node.expanded = true;
          return true;
        }
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
    return false;
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

  private selectNode(node: TreeNode | null): void {
    this.selectedNode = node;
    if (this.tree) {
      this.tree.selection = node;
    }
  }

  private findNodeByLabel(nodes: TreeNode[], query: string): TreeNode | null {
    for (const node of nodes) {
      if (node.label?.toLowerCase().includes(query)) {
        return node;
      }
      if (node.children) {
        const childMatch = this.findNodeByLabel(node.children, query);
        if (childMatch) {
          node.expanded = true;
          return childMatch;
        }
      }
    }
    return null;
  }
}
