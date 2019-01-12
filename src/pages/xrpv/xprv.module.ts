import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';
import { XprvPage } from './xprv';

@NgModule({
  declarations: [
    XprvPage,
  ],
  imports: [
    IonicPageModule.forChild(XprvPage),
    TranslateModule.forChild()
  ],
})
export class XprvPageModule {}
