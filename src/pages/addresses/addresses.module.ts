import { NgModule } from '@angular/core'
import { IonicPageModule } from 'ionic-angular'
import { TranslateModule } from '@ngx-translate/core';
import { AddressesPage } from './addresses'

@NgModule({
  declarations: [
    AddressesPage,
  ],
  imports: [
    IonicPageModule.forChild(AddressesPage),
    TranslateModule.forChild()
  ],
})
export class AddressesPageModule {}
