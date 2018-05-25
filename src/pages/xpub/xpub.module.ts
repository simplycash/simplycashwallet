import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';
import { XpubPage } from './xpub';

@NgModule({
  declarations: [
    XpubPage,
  ],
  imports: [
    IonicPageModule.forChild(XpubPage),
    TranslateModule.forChild()
  ],
})
export class XpubPageModule {}
