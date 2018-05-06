import { NgModule } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { IonicPageModule } from 'ionic-angular';

import { PipesModule } from '../../pipes/pipes.module'

import { ConfirmPage } from './confirm';

@NgModule({
  declarations: [
    ConfirmPage,
  ],
  imports: [
    IonicPageModule.forChild(ConfirmPage),
    TranslateModule.forChild(),
    PipesModule,
  ],
  exports: [
    ConfirmPage
  ]
})
export class ConfirmPageModule { }
