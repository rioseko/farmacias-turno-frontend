import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core'
import { BrowserModule, provideClientHydration, withEventReplay } from '@angular/platform-browser'
import { HttpClientModule } from '@angular/common/http'

import { AppRoutingModule } from './app-routing-module'
import { App } from './app'
import { FarmaciasPageComponent } from './pages/farmacias-page/farmacias-page.component'
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component'

@NgModule({
  declarations: [App],
  imports: [BrowserModule, HttpClientModule, AppRoutingModule, FarmaciasPageComponent, ThemeToggleComponent],
  providers: [provideBrowserGlobalErrorListeners(), provideClientHydration(withEventReplay())],
  bootstrap: [App],
})
export class AppModule {}
