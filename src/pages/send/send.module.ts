import { NgModule } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { IonicPageModule } from 'ionic-angular';

import { ComponentsModule } from '../../components/components.module'

import { SendPage } from './send';

@NgModule({
  declarations: [
    SendPage
  ],
  imports: [
    IonicPageModule.forChild(SendPage),
    TranslateModule.forChild(),
    ComponentsModule
  ],
  exports: [
    SendPage
  ]
})
export class SendPageModule { }
