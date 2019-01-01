import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { TranslateModule } from '@ngx-translate/core';
import { WifPage } from './wif';

@NgModule({
  declarations: [
    WifPage,
  ],
  imports: [
    IonicPageModule.forChild(WifPage),
    TranslateModule.forChild()
  ],
})
export class WifPageModule {}
