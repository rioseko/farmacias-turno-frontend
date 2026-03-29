import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { FarmaciasPageComponent } from './pages/farmacias-page/farmacias-page.component'

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'farmacia-de-turno-temuco' },
  { path: 'farmacia-de-turno-temuco', component: FarmaciasPageComponent },
]

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
