// src/app/app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
    { path: '', children: [] },
    { path: '**', redirectTo: '', pathMatch: 'full' }
];