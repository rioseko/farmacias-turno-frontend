import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'
import { FarmaciasPageComponent } from './pages/farmacias-page/farmacias-page.component'

const routes: Routes = [
  { path: '', component: FarmaciasPageComponent },
]

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
