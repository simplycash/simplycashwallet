import { NgModule } from '@angular/core';
import { IonicPageModule } from 'ionic-angular';
import { MorePage } from './more';
import { TranslateModule } from '@ngx-translate/core';

@NgModule({
  declarations: [
    MorePage,
  ],
  imports: [
    IonicPageModule.forChild(MorePage),
    TranslateModule.forChild(),
  ],
})
export class MorePageModule {}
