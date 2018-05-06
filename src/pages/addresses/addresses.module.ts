import { NgModule } from '@angular/core'
import { IonicPageModule } from 'ionic-angular'
import { AddressesPage } from './addresses'

@NgModule({
  declarations: [
    AddressesPage,
  ],
  imports: [
    IonicPageModule.forChild(AddressesPage)
  ],
})
export class AddressesPageModule {}
